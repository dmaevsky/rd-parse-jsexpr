import test from 'node:test';
import assert from 'node:assert/strict';

import snapshot from 'usnap';

snapshot.setup(import.meta.url);

import Parser from 'rd-parse';
import Grammar from '../src/grammar.js';

const parser = Parser(Grammar);

test('empty input', () => {
  assert.throws(() => parser(''), new Error('Unexpected token at 1:1. Remainder: '));
});

test('faulty input', () => {
  assert.throws(() => parser('a + \n]'), new Error('Unexpected token at 2:1. Remainder: ]'));
});

test('Identifier', () => {
  const ast = parser(' bla ');
  assert.deepEqual(ast, { type: 'Identifier', name: 'bla' });
  assert.equal(ast.pos, 1);
});

test('boolean literals', t => {
  const ast = parser('false || true');
  snapshot(ast, t.name);
});

test('a string literal', () => {
  const ast = parser(' "bla \\" bla" ');
  assert.deepEqual(ast, { type: 'Literal', value: 'bla " bla', raw: '"bla \\" bla"' });
});

test('a number literal', () => {
  const ast = parser(' 5e2 ');
  assert.deepEqual(ast, { type: 'Literal', value: 500, raw: '5e2' });
});

test('operator precedence', t => {
  const ast = parser('x*x + y*y');
  snapshot(ast, t.name);
});

test('left associativity', t => {
  const ast = parser('a + b - c');
  snapshot(ast, t.name);
});

test('exponentiation operator (right associativity)', t => {
  const ast = parser('a ** b ** c / 2');
  snapshot(ast, t.name);
});

test('ArrowFunction, simple', () => {
  const ast = parser('x => x * x');
  assert.equal(ast.type, 'ArrowFunction');
  assert.deepEqual(ast.parameters, { bindingType: 'SingleName', name: 'x' });
  assert.equal(ast.parameters.rest, undefined);
  assert.equal(ast.result.type, 'BinaryExpression');
});

test('ArrowFunction, with initializer and rest parameter', () => {
  const ast = parser('(c = 1, ...a) => c + a.length');
  assert.equal(ast.type, 'ArrowFunction');
  assert.equal(ast.parameters.bound.length, 1);
  assert.equal(ast.parameters.bindingType, 'FormalParameters');
  assert.deepEqual(ast.parameters.bound[0].pattern, { bindingType: 'SingleName', name: 'c' });
  assert.deepEqual(ast.parameters.bound[0].initializer, { type: 'Literal', value: 1, raw: '1' });
  assert.deepEqual(ast.parameters.rest, { bindingType: 'SingleName', name: 'a' });
});

test('template literals', () => {
  const ast = parser('`${a} + ${b} is ${a + b}`');
  assert.equal(ast.type, 'TemplateLiteral');
  assert.deepEqual(ast.parts[0], ['expressions', { type: 'Identifier', name: 'a' }]);
  assert.deepEqual(ast.parts[1], ['chunks', ' + ']);
  assert.deepEqual(ast.parts[2], ['expressions', { type: 'Identifier', name: 'b' }]);
  assert.deepEqual(ast.parts[3], ['chunks', ' is ']);
  assert.equal(ast.parts[4][1].type, 'BinaryExpression');
});

test('template litarals 2', t => {
  const input = '`Mismatched timing labels (expected ${this.current_timing.label}, got ${label})`';
  snapshot(parser(input), t.name);
});

test('object literal short notation', t => {
  const input = '{ foo }';
  const ast = parser(input);
  snapshot(ast, t.name);

  assert.equal(ast.properties[0].name, 'foo');
  assert.equal(ast.properties[0].value.pos, 2);
  assert.equal(ast.properties[0].value.text, 'foo');
});

test('pos and text for member and call expressions', () => {
  const input = 'obj.method(a, b)';
  const ast = parser(' ' + input + ' ');

  assert.equal(ast.type, 'CallExpression');
  assert.equal(ast.pos, 1);
  assert.equal(ast.text, input);
  assert.equal(ast.callee.type, 'MemberExpression');
  assert.equal(ast.callee.pos, 1);
  assert.equal(ast.callee.text, 'obj.method');
  assert.equal(ast.callee.object.type, 'Identifier');
  assert.equal(ast.callee.object.pos, 1);
  assert.equal(ast.callee.object.text, 'obj');
});

test('pos and text for unary expressions', () => {
  const input = 'typeof ~foo';
  const ast = parser(input);

  assert.equal(ast.type, 'UnaryExpression');
  assert.equal(ast.operator, 'typeof');
  assert.equal(ast.argument.type, 'UnaryExpression');
  assert.equal(ast.argument.operator, '~');
  assert.equal(ast.argument.pos, 7);
  assert.equal(ast.argument.text, '~foo');
});

test('pos and text for binary expressions', () => {
  const input = 'a + 2 * b';
  const ast = parser(input);

  assert.equal(ast.type, 'BinaryExpression');
  assert.equal(ast.operator, '+');
  assert.equal(ast.text, input);
  assert.equal(ast.right.type, 'BinaryExpression');
  assert.equal(ast.right.operator, '*');
  assert.equal(ast.right.pos, 4);
  assert.equal(ast.right.text, '2 * b');
});

test('pos and text for bound names', () => {
  const input = '(a, ...r) => a + r[0]';
  const ast = parser(input);

  assert.equal(ast.type, 'ArrowFunction');
  assert.equal(ast.parameters.bound[0].pattern.bindingType, 'SingleName');
  assert.equal(ast.parameters.bound[0].pattern.pos, 1);
  assert.equal(ast.parameters.rest.bindingType, 'SingleName');
  assert.equal(ast.parameters.rest.pos, 7);
});

test('new expression + memeber expression', () => {
  const input = 'new Array(3).length';
  const ast = parser(input);

  assert.equal(ast.type, 'MemberExpression');
  assert.equal(ast.object.type, 'NewExpression');
  assert.equal(ast.object.ctor.type, 'Identifier');
  assert.equal(ast.object.ctor.pos, 4);
});

test('new expression + call expression', () => {
  const input = 'new Array(3).map((_, i) => i)';
  const ast = parser(input);

  assert.equal(ast.type, 'CallExpression');
  assert.equal(ast.callee.type, 'MemberExpression');
  assert.equal(ast.callee.object.type, 'NewExpression');
  assert.equal(ast.callee.object.ctor.type, 'Identifier');
  assert.equal(ast.callee.object.ctor.pos, 4);
});

test('pos and text for arrow functions', () => {
  const input = ' () => x ';
  const ast = parser(input);

  assert.equal(ast.type, 'ArrowFunction');
  assert.equal(ast.pos, 1);
  assert.equal(ast.text, '() => x');
});

test('object literal with spread', t => {
  const input = '{ foo: 5, ...bar }';
  const ast = parser(input);

  snapshot(ast, t.name);

  assert.equal(ast.type, 'ObjectLiteral');
  assert.equal(ast.properties[0].name, 'foo');
  assert.equal(ast.properties[1].spread.type, 'Identifier');
  assert.equal(ast.properties[1].spread.name, 'bar');
});

test('array literals', t => {
  const input = '[[,,,], [,5,,], [...a,, 5, ...b]]';
  const ast = parser(input);

  snapshot(ast, t.name);
});

test('destructuring', t => {
  const input = '([{y: {z1 = 5, ...z2} = {x:6}}, z3, ...z4]) => (z1 * z2.x) * z3 * z4.length';
  const ast = parser(input);

  snapshot(ast, t.name);
});

test('pos and text for bound short-hand parameters', () => {
  const input = '({ x, y = 5 }) => x * y'
  const ast = parser(input);

  assert.equal(ast.type, 'ArrowFunction');

  assert.equal(ast.parameters.bound[0].pattern.bindingType, 'ObjectPattern');
  assert.equal(ast.parameters.bound[0].pattern.bound[0].prop, 'x');
  assert.equal(ast.parameters.bound[0].pattern.bound[0].pattern.bindingType, 'SingleName');
  assert.equal(ast.parameters.bound[0].pattern.bound[0].pattern.name, 'x');
  assert.equal(ast.parameters.bound[0].pattern.bound[0].pattern.text, 'x');
  assert.equal(ast.parameters.bound[0].pattern.bound[0].pattern.pos, 3);
  assert.equal(ast.parameters.bound[0].pattern.bound[1].pattern.text, 'y');
});
