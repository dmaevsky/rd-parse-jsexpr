import { Ignore, All, Any, Optional, Star, Node } from 'rd-parse';

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
export const InterpolationChunkToken = /^((?:\$(?!{)|\\.|[^`$\\])+)/;

export const NumericToken = Any(
  /^((?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][-+]?[0-9]+)?)\b/,   // decimal
  /^(0[xX][0-9a-fA-F]+)\b/                                   // hex
);

export const NullToken = /^(null)\b/;
export const BooleanToken = /^(true|false)\b/;
// const RegExToken = /^\/([^/]+)\/([gimuy]*\b)?/;

export const IdentifierToken = /^([a-zA-Z_$][a-zA-Z0-9_$]*)/;

const srcMap = (obj, $, $next) => Object.defineProperties(obj, {
  pos: { writable: true, configurable: true, value: $.pos },
  text: { writable: true, configurable: true, value: ($.text || $next.text).slice($.pos, $next.pos) },
});

const Expression = $ => Grammar($);

const Identifier = Node(IdentifierToken, ([name]) => ({ type: 'Identifier', name }));

// Literals
const StringLiteral = Node(StringToken, ([raw]) => ({ type: 'Literal', value: eval(raw), raw }));
const NumericLiteral = Node(NumericToken, ([raw]) => ({ type: 'Literal', value: +raw, raw }));
const NullLiteral = Node(NullToken, ([raw]) => ({ type: 'Literal', value: null, raw }));
const BooleanLiteral = Node(BooleanToken, ([raw]) => ({ type: 'Literal', value: raw === 'true', raw }));
// const RegExLiteral = Node(RegExToken, ([raw, flags]) => ({ type: 'Literal', value: new RegExp(raw, flags), raw: `/${raw}/${flags||''}` }));

const InterpolationChunk = Node(InterpolationChunkToken, ([raw]) => ['chunks', eval('`' + raw + '`')]);
const TemplateInlineExpression = Node(All('${', IgnoreWhitespace(Expression), '}'), ([expression]) => ['expressions', expression]);

const TemplateLiteral = Node(Ignore(null, All('`', Star(Any(InterpolationChunk, TemplateInlineExpression)), '`')),
  parts => ({ type: 'TemplateLiteral', parts }));

const Literal = Any(StringLiteral, NumericLiteral, NullLiteral, BooleanLiteral, TemplateLiteral /*, RegExLiteral*/);

// Array literal

const EmptyElement = Node(',', () => ({ empty: true }));
const Elision = All(',', Star(EmptyElement));
const SpreadElement = Node(All('...', Expression), ([spread]) => ({ spread }));
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
const ShortNotation = Node(Identifier, ([expr], ...$$) => srcMap({ ...expr, shortNotation: true }, ...$$));
const ComputedPropertyName = Node(All('[', CompoundExpression, ']'), ([computed]) => ({ computed }));
const PropertyName = Any(IdentifierToken, StringLiteral, NumericLiteral, ComputedPropertyName);
const PropertyDefinition = Node(Any(All(PropertyName, ':', Expression), ShortNotation, SpreadElement),
  ([name, value]) => name.spread ? name : ({ name: value ? name : name.name, value: value || name })
);
const PropertyDefinitions = All(PropertyDefinition, Star(All(',', PropertyDefinition)));
const PropertyDefinitionList = Optional( All(PropertyDefinitions, Optional(',')) );
const ObjectLiteral = Node(All('{', PropertyDefinitionList, '}'), properties => ({ type: 'ObjectLiteral', properties}));

// Primary expression
const PrimaryExpression = Node(Any(Literal, Identifier, ArrayLiteral, ObjectLiteral, All('(', CompoundExpression, ')')),
  ([expr], ...$$) => srcMap(expr, ...$$));

// Member expression
const ArgumentsList = All(Element, Star(All(',', Element)));
const Arguments = Node(All('(', Optional(All(ArgumentsList, Optional(','))), ')'), args => ({ args }));

const PropertyAccess = Any(All('.', IdentifierToken), ComputedPropertyName);
const PropertyAccessOrArguments = Node(Any(PropertyAccess, Arguments), ([part], _, $next) => ({ part, $next }));

const MemberExpression = Node(All(Optional(/^new\b/), PrimaryExpression, Star(PropertyAccessOrArguments)),
  (parts, $, $last) => {
    const result = parts.reduce((acc, { part, $next }) => {
      if (part.args) {
        return srcMap($.pos !== acc.pos ?
          { type: 'NewExpression', ctor: acc, arguments: part.args } :
          { type: 'CallExpression', callee: acc, arguments: part.args },
          $, $next);
      }
      return srcMap({ type: 'MemberExpression', object: acc, property: part }, { pos: acc.pos }, $next);
    });

    if (result.pos === $.pos) return result;
    return srcMap({ type: 'NewExpression', ctor: result, arguments: [] }, $, $last);
  }
);

// Unary expressions
const Operator = Rule => Node(Rule, (_, $, $next) => ({ $, operator: $.text.substring($.pos, $next.pos) }));

const UnaryOperator = Operator(Any('+', '-', '~', '!', /^typeof\b/));
const UnaryExpression = Node(All(Star(UnaryOperator), MemberExpression),
  (parts, _, $next) => parts.reduceRight((argument, { $, operator }) => srcMap({ type: 'UnaryExpression', argument, operator }, $, $next)));

// Binary expressions
const BitwiseAnd = /^&(?!&)/;
const BitwiseOr = /^\|(?!\|)/;

const BinaryOperatorPrecedence = [
  '**',
  Any('*', '/', '%'),
  Any('+', '-'),
  Any('>>>', '<<', '>>'),
  Any('<=', '>=', '<', '>', /^instanceof\b/, /^in\b/),
  Any('===', '!==', '==', '!='),
  BitwiseAnd,
  '^',
  BitwiseOr,
  '&&',
  '||'
];

const associativity = BinaryOp => BinaryOp === '**' ? rightToLeft : leftToRight;

function leftToRight(parts, $) {
  let left = parts[0];

  for (let i = 1; i < parts.length; i += 2) {
    const [operator, right] = [parts[i].operator, parts[i + 1]];

    left = srcMap({
      type: 'BinaryExpression',
      left, operator, right
    }, $, { pos: right.pos + right.text.length });
  }
  return left;
}

function rightToLeft(parts, _, $next) {
  let right = parts[parts.length - 1];

  for (let i = parts.length - 2; i >= 0; i -= 2) {
    const [left, operator] = [parts[i - 1], parts[i].operator];

    right = srcMap({
      type: 'BinaryExpression',
      left, operator, right
    }, { pos: left.pos }, $next);
  }
  return right;
}

const ExpressionConstructor = (Expr, BinaryOp) => Node(All(Expr, Star(All(Operator(BinaryOp), Expr))), associativity(BinaryOp));
const LogicalORExpression = BinaryOperatorPrecedence.reduce(ExpressionConstructor, UnaryExpression);

const ConditionalExpression = Node(All(LogicalORExpression, Optional(All('?', Expression, ':', Expression))),
  ([test, consequent, alternate]) => consequent ? ({ type: 'ConditionalExpression', test, consequent, alternate }) : test);

// Binding patterns
export const BindingElement = $ => BindingElementImpl($);

const BoundName = Node(IdentifierToken, ([name], ...$$) => srcMap({ bindingType: 'SingleName', name }, ...$$));
const RestElement = Node(All('...', BoundName), ([rest]) => ({rest}));

const BindingList = (List, bindingType) => Node(Any(All(Node(List, bound => ({ bound })), Optional(All(',', Optional(RestElement)))), Optional(RestElement)),
  parts => parts.reduce((acc, part) => Object.assign(acc, part), { bound: [], bindingType }));

const WithInitializer = Pattern => Node(All(Pattern, Optional(All('=', Expression))),
  ([pattern, initializer]) => initializer ? { pattern, initializer } : { pattern });

const SingleNameBinding = WithInitializer(BoundName);

const BindingProperty = Node(Any(All(PropertyName, ':', BindingElement), SingleNameBinding),
  ([prop, pattern]) => pattern ? { prop, ...pattern } : { prop: prop.pattern.name, ...prop });

const BindingPropertyList = All(BindingProperty, Star(All(',', BindingProperty)));
const ObjectBindingPattern = All('{', BindingList(BindingPropertyList, 'ObjectPattern'), '}');

const BindingElementList = All(Star(EmptyElement), Optional(All(BindingElement, Star(All(Elision, BindingElement)))));
const ArrayBindingPattern = All('[', BindingList(BindingElementList, 'ArrayPattern'), ']');

export const BindingPattern = Any(BoundName, ObjectBindingPattern, ArrayBindingPattern);

const BindingElementImpl = Node(WithInitializer(BindingPattern), ([pattern], ...$$) => srcMap(pattern, ...$$));

// Arrow functions
const FormalsList = All(BindingElement, Star(All(',', BindingElement)));
const FormalParameters = All('(', BindingList(FormalsList, 'FormalParameters'), ')');

const ArrowParameters = Any(BoundName, FormalParameters);

const FoolSafe = Node('{', () => { throw new Error('Object literal returned from the arrow function needs to be enclosed in ()'); });
const ArrowResult = Any(FoolSafe, Expression);

const ArrowFunction = Node(All(ArrowParameters, '=>', ArrowResult), ([parameters, result]) => ({ type: 'ArrowFunction', parameters, result }));

const Grammar = Node(Any(ArrowFunction, ConditionalExpression), ([expr], ...$$) => srcMap(expr, ...$$));

export default IgnoreWhitespace(Grammar);
