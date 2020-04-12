const Y = proc => (x => proc(y => (x(x))(y)))(x => proc(y => (x(x))(y)));

function Grammar({ Ignore, All, Any, Plus, Optional, Node }) {
  const Star = rule => Optional(Plus(rule));

  // An "immutable" pure functional reduction of ECMAScript grammar:
  // loosely based on https://gist.github.com/avdg/1f10e268e484b1284b46
  // and http://tomcopeland.blogs.com/EcmaScript.html
  // Matches (almost) anything you can put on the right hand side of an assignment operator in ES6

  // Tokens: mostly from https://www.regular-expressions.info/examplesprogrammer.html

  const Scanner = Rule => Ignore(/\s+/g, Rule);   // Ignore whitespace

  const StringToken = Any(
    /('[^'\\]*(?:\\.[^'\\]*)*')/g,  // single-quoted
    /("[^"\\]*(?:\\.[^"\\]*)*")/g,  // double-quoted
  );

  const NumericToken = Any(
    /\b((?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][-+]?[0-9]+)?)\b/g,   // decimal
    /\b(0[xX][0-9a-fA-F]+)\b/g                                   // hex
  );

  const NullToken = /\b(null)\b/g;
  const BooleanToken = /\b(true|false)\b/g;
  // const RegExToken = /\/([^/]+)\/([gimuy]*\b)?/g;

  const IdentifierToken = /([a-zA-Z_$][a-zA-Z0-9_$]*)/g;

  return Y(function(Expression) {

    const Identifier = Node(IdentifierToken, ([name], $) => ({ type: 'Identifier', name, pos: $.pos }));

    // Literals
    const StringLiteral = Node(StringToken, ([raw]) => ({ type: 'Literal', value: eval(raw), raw }));
    const NumericLiteral = Node(NumericToken, ([raw]) => ({ type: 'Literal', value: +raw, raw }));
    const NullLiteral = Node(NullToken, ([raw]) => ({ type: 'Literal', value: null, raw }));
    const BooleanLiteral = Node(BooleanToken, ([raw]) => ({ type: 'Literal', value: raw === 'true', raw }));
    // const RegExLiteral = Node(RegExToken, ([raw, flags]) => ({ type: 'Literal', value: new RegExp(raw, flags), raw: `/${raw}/${flags||''}` }));

    const Literal = Any(StringLiteral, NumericLiteral, NullLiteral, BooleanLiteral /*, RegExLiteral*/);

    // Array literal

    const EmptyElement = Node(',', () => ({ type: 'EmptyElement'}));
    const Elision = All(',', Star(EmptyElement));
    const SpreadElement = Node(All('...', Expression), ([expression]) => ({ type: 'SpreadElement', expression }));
    const Element = Any(SpreadElement, Expression);

    const ElementList = All(Star(EmptyElement), Element, Star(All(Elision, Element)));

    const ArrayLiteral =	Node(All('[', Any(
      All(Star(EmptyElement), ']'),
      All(ElementList, Optional(Elision), ']'),
    )), elements => ({ type: 'ArrayLiteral', elements }));

    // Compound expression
    const CompoundExpression = Node(All(Expression, Star(All(',', Expression))),
      leafs => leafs.length > 1 ? { type: 'CompoundExpression', leafs } : leafs[0]);

    // Object literal

    const ComputedPropertyName = Node(All('[', CompoundExpression, ']'), ([expression]) => ({ type: 'ComputedProperty', expression }));
    const PropertyName = Any(Identifier, StringLiteral, NumericLiteral, ComputedPropertyName);
    const PropertyDefinition = Node(Any(All(PropertyName, ':', Expression), Identifier), ([name, value]) => ({name, value: value || name}));
    const PropertyDefinitions = All(PropertyDefinition, Star(All(',', PropertyDefinition)));
    const PropertyDefinitionList = Optional( All(PropertyDefinitions, Optional(',')) );
    const ObjectLiteral = Node(All('{', PropertyDefinitionList, '}'), properties => ({ type: 'ObjectLiteral', properties}));

    // Primary expression
    const PrimaryExpression = Any(Identifier, Literal, ArrayLiteral, ObjectLiteral, All('(', CompoundExpression, ')'));

    // Member expression
    const ArgumentsList = All(Element, Star(All(',', Element)));
    const Arguments = Node(All('(', Optional(All(ArgumentsList, Optional(','))), ')'), args => ({ args }));

    const PropertyAccess = Any(All('.', Identifier), ComputedPropertyName);
    const MemberExpression = Node(All(PrimaryExpression, Star(Any(PropertyAccess, Arguments))),
      parts => parts.reduce((acc, part) => ( part.args  ?
        { type: 'CallExpression', callee: acc, arguments: part.args } :
        { type: 'MemberExpression', object: acc, property: part }
    )));

    const NewExpression = Node(All('new', MemberExpression), ([expression]) => ({ type: 'NewExpression', expression }));
    const LeftHandSideExpression = Any(NewExpression, MemberExpression);

    // Unary expressions

    const Operator = Rule => Node(Rule, (_, $, $next) => $.text.substring($.pos, $next.pos));

    const UnaryOperator = Operator(Any('+', '-', '~', '!', 'typeof'));
    const UnaryExpression = Node(All(Star(UnaryOperator), LeftHandSideExpression),
      parts => parts.reduceRight((argument, operator) => ({ type: 'UnaryExpression', argument, operator })));

    // Binary expressions
    const BinaryOperatorPrecedence = [
      Any('*', '/', '%'),
      Any('+', '-'),
      Any('>>>', '<<', '>>'),
      Any('<=', '>=', '<', '>', 'instanceof', 'in'),
      Any('===', '!==', '==', '!='),
      '&',
      '^',
      '|',
      '&&',
      '||'
    ];

    const ApplyBinaryOp = (BinaryOp, Expr) => Node(All(Operator(BinaryOp), Expr), ([operator, right]) => ({operator, right}));
    const ExpressionConstructor = (Expr, BinaryOp) => Node(All(Expr, Star(ApplyBinaryOp(BinaryOp, Expr))),
      parts => parts.reduce((left, { operator, right }) => ({ type: 'BinaryExpression', left, right, operator })));

    const LogicalORExpression = BinaryOperatorPrecedence.reduce(ExpressionConstructor, UnaryExpression);

    const ConditionalExpression = Node(All(LogicalORExpression, Optional(All('?', Expression, ':', Expression))),
      ([test, consequent, alternate]) => consequent ? ({ type: 'ConditionalExpression', test, consequent, alternate }) : test);

    // Arrow functions
    const BindingElement = Node(All(Identifier, Optional(All('=', Expression))),   // Do not support destructuring just yet
      ([param, initializer]) => initializer ? Object.assign(param, {initializer}) : param);
    const FormalsList = Node(All(BindingElement, Star(All(',', BindingElement))), bound => ({ bound }));
    const RestElement = Node(All('...', Identifier), ([rest]) => ({rest}));

    const FormalParameters = Node(All('(', Any( All(FormalsList, Optional(All(',', RestElement))), Optional(RestElement) ), ')'),
      parts => parts.reduce((acc, part) => Object.assign(acc, part), { bound: [] }));

    const ArrowParameters = Node(Any(Identifier, FormalParameters), ([params]) => params.bound ? params : { bound: [params] });

    const FoolSafe = Node('{', () => { throw new Error('Object literal returned from the arrow function needs to be enclosed in ()'); });
    const ArrowResult = Any(FoolSafe, Expression);

    const ArrowFunction = Node(All(ArrowParameters, '=>', ArrowResult), ([parameters, result]) => ({ type: 'ArrowFunction', parameters, result }));

    return Scanner(Any(ArrowFunction, ConditionalExpression));
  });
}

module.exports = Grammar;
