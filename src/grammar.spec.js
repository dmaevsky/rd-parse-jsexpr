import test from 'ava';

import Parser from 'rd-parse';
import Grammar from './grammar';

const parser = Parser(Grammar);

test('empty input', t => {
  t.throws(() => parser(''), { instanceOf: Error, message: 'Unexpected token at 1:1. Remainder: ' });
});

test('faulty input', t => {
  t.throws(() => parser('a + \n]'), { instanceOf: Error, message: 'Unexpected token at 2:1. Remainder: ]' });
});

test('Identifier', t => {
  const ast = parser(' bla ');
  t.deepEqual(ast, { type: 'Identifier', name: 'bla' });
  t.is(ast.pos, 1);
});

test('boolean literals', t => {
  const ast = parser('false || true');
  t.snapshot(ast);
});

test('a string literal', t => {
  const ast = parser(' "bla \\" bla" ');
  t.deepEqual(ast, { type: 'Literal', value: 'bla " bla', raw: '"bla \\" bla"' });
});

test('a number literal', t => {
  const ast = parser(' 5e2 ');
  t.deepEqual(ast, { type: 'Literal', value: 500, raw: '5e2' });
});

test('operator precedence', t => {
  const ast = parser('x*x + y*y');
  t.snapshot(ast);
});

test('left associativity', t => {
  const ast = parser('a + b - c');
  t.snapshot(ast);
});

test('exponentiation operator (right associativity)', t => {
  const ast = parser('a ** b ** c / 2');
  t.snapshot(ast);
});

test('ArrowFunction, simple', t => {
  const ast = parser('x => x * x');
  t.is(ast.type, 'ArrowFunction');
  t.is(ast.parameters.bound.length, 1);
  t.deepEqual(ast.parameters.bound[0], { type: 'Identifier', name: 'x' });
  t.is(ast.parameters.rest, undefined);
  t.is(ast.result.type, 'BinaryExpression');
});

test('ArrowFunction, with initializer and rest parameter', t => {
  const ast = parser('(c = 1, ...a) => c + a.length');
  t.is(ast.type, 'ArrowFunction');
  t.is(ast.parameters.bound.length, 1);
  t.deepEqual(ast.parameters.bound[0].initializer, { type: 'Literal', value: 1, raw: '1' });
  t.deepEqual(ast.parameters.rest, { type: 'Identifier', name: 'a' });
});

test('template literals', t => {
  const ast = parser('`${a} + ${b} is ${a + b}`');
  t.is(ast.type, 'TemplateLiteral');
  t.deepEqual(ast.parts[0], ['expressions', { type: 'Identifier', name: 'a' }]);
  t.deepEqual(ast.parts[1], ['chunks', ' + ']);
  t.deepEqual(ast.parts[2], ['expressions', { type: 'Identifier', name: 'b' }]);
  t.deepEqual(ast.parts[3], ['chunks', ' is ']);
  t.is(ast.parts[4][1].type, 'BinaryExpression');
});

test('template litarals 2', t => {
  const input = '`Mismatched timing labels (expected ${this.current_timing.label}, got ${label})`';
  t.snapshot(parser(input));
});

test('object literal short notation', t => {
  const input = '{ foo }';
  t.snapshot(parser(input));
});

test('pos and text for member and call expressions', t => {
  const input = 'obj.method(a, b)';
  const ast = parser(' ' + input + ' ');

  t.is(ast.type, 'CallExpression');
  t.is(ast.pos, 1);
  t.is(ast.text, input);
  t.is(ast.callee.type, 'MemberExpression');
  t.is(ast.callee.pos, 1);
  t.is(ast.callee.text, 'obj.method');
  t.is(ast.callee.object.type, 'Identifier');
  t.is(ast.callee.object.pos, 1);
  t.is(ast.callee.object.text, 'obj');
});

test('pos and text for unary expressions', t => {
  const input = 'typeof ~foo';
  const ast = parser(input);

  t.is(ast.type, 'UnaryExpression');
  t.is(ast.operator, 'typeof');
  t.is(ast.argument.type, 'UnaryExpression');
  t.is(ast.argument.operator, '~');
  t.is(ast.argument.pos, 7);
  t.is(ast.argument.text, '~foo');
});

test('pos and text for binary expressions', t => {
  const input = 'a + 2 * b';
  const ast = parser(input);

  t.is(ast.type, 'BinaryExpression');
  t.is(ast.operator, '+');
  t.is(ast.text, input);
  t.is(ast.right.type, 'BinaryExpression');
  t.is(ast.right.operator, '*');
  t.is(ast.right.pos, 4);
  t.is(ast.right.text, '2 * b');
});
