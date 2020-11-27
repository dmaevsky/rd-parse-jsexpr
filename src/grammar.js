import { Ignore, All, Any, Optional, Star, Node, Y } from 'rd-parse';

// An "immutable" pure functional reduction of ECMAScript grammar:
// loosely based on https://gist.github.com/avdg/1f10e268e484b1284b46
// and http://tomcopeland.blogs.com/EcmaScript.html
// Matches (almost) anything you can put on the right hand side of an assignment operator in ES6

// Tokens: mostly from https://www.regular-expressions.info/examplesprogrammer.html

export const IgnoreWhitespace = Rule => Ignore(/^\s+/, Rule);

export const StringToken = Any(
  /^('[^'\\]*(?:\\.[^'\\]*)*')/,  // single-quoted
  /^("[^"\\]*(?:\\.[^"\\]*)*")/,  // double-quoted
);

// Turn off ignore whitespace for InterpolationChunk
export const InterpolationChunkToken = Ignore(null, /^((?:\$(?!{)|\\.|[^`$\\])+)/);

export const NumericToken = Any(
  /^((?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][-+]?[0-9]+)?)\b/,   // decimal
  /^(0[xX][0-9a-fA-F]+)\b/                                   // hex
);

export const NullToken = /^(null)\b/;
export const BooleanToken = /^(true|false)\b/;
// const RegExToken = /^\/([^/]+)\/([gimuy]*\b)?/;

export const IdentifierToken = /^([a-zA-Z_$][a-zA-Z0-9_$]*)/;

const Grammar = Y(function(Expression) {

  const Identifier = Node(IdentifierToken, ([name], $) => Object.defineProperty({ type: 'Identifier', name },
    'pos', { writable: true, configurable: true, value: $.pos }));

  // Literals
  const StringLiteral = Node(StringToken, ([raw]) => ({ type: 'Literal', value: eval(raw), raw }));
  const NumericLiteral = Node(NumericToken, ([raw]) => ({ type: 'Literal', value: +raw, raw }));
  const NullLiteral = Node(NullToken, ([raw]) => ({ type: 'Literal', value: null, raw }));
  const BooleanLiteral = Node(BooleanToken, ([raw]) => ({ type: 'Literal', value: raw === 'true', raw }));
  // const RegExLiteral = Node(RegExToken, ([raw, flags]) => ({ type: 'Literal', value: new RegExp(raw, flags), raw: `/${raw}/${flags||''}` }));

  const InterpolationChunk = Node(InterpolationChunkToken, ([raw]) => ['chunks', eval('`' + raw + '`')]);
  const TemplateInlineExpression = Node(All('${', Expression, '}'), ([expression]) => ['expressions', expression]);

  const TemplateLiteral = Node(All('`', Star(Any(InterpolationChunk, TemplateInlineExpression)), '`'),
    parts => ({ type: 'TemplateLiteral', parts }));

  const Literal = Any(StringLiteral, NumericLiteral, NullLiteral, BooleanLiteral, TemplateLiteral /*, RegExLiteral*/);

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
  const PrimaryExpression = Any(Literal, Identifier, ArrayLiteral, ObjectLiteral, All('(', CompoundExpression, ')'));

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
  const BitwiseAnd = /^&(?!&)/;
  const BitwiseOr = /^\|(?!\|)/;

  const BinaryOperatorPrecedence = [
    '**',
    Any('*', '/', '%'),
    Any('+', '-'),
    Any('>>>', '<<', '>>'),
    Any('<=', '>=', '<', '>', 'instanceof', 'in'),
    Any('===', '!==', '==', '!='),
    BitwiseAnd,
    '^',
    BitwiseOr,
    '&&',
    '||'
  ];

  const associativity = BinaryOp => BinaryOp === '**' ? rightToLeft : leftToRight;

  function leftToRight(parts) {
    let left = parts[0];

    for (let i = 1; i < parts.length; i += 2) {
      left = {
        type: 'BinaryExpression',
        left,
        operator: parts[i],
        right: parts[i + 1],
      };
    }
    return left;
  }

  function rightToLeft(parts) {
    let right = parts[parts.length - 1];

    for (let i = parts.length - 2; i >= 0; i -= 2) {
      right = {
        type: 'BinaryExpression',
        left: parts[i - 1],
        operator: parts[i],
        right,
      };
    }
    return right;
  }

  const ExpressionConstructor = (Expr, BinaryOp) => Node(All(Expr, Star(All(Operator(BinaryOp), Expr))), associativity(BinaryOp));
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

  return IgnoreWhitespace(Any(ArrowFunction, ConditionalExpression));
});

export default Grammar;
