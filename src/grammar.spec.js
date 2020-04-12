const test = require('ava');

const Parser = require('rd-parse');
const Grammar = require('./grammar');


const parser = Parser(Grammar);

test('Identifier', t => {
  const ast = parser(' bla ');
  t.deepEqual(ast, { type: 'Identifier', name: 'bla', pos: 1 });
});

test('a string literal', t => {
  const ast = parser(' "bla \\" bla" ');
  t.deepEqual(ast, { type: 'Literal', value: 'bla " bla', raw: '"bla \\" bla"' });
});

test('a number literal', t => {
  const ast = parser(' 5e2 ');
  t.deepEqual(ast, { type: 'Literal', value: 500, raw: '5e2' });
});

test('ArrowFunction, simple', t => {
  const ast = parser('x => x * x');
  t.is(ast.type, 'ArrowFunction');
  t.is(ast.parameters.bound.length, 1);
  t.deepEqual(ast.parameters.bound[0], { type: 'Identifier', name: 'x', pos: 0 });
  t.is(ast.parameters.rest, undefined);
  t.is(ast.result.type, 'BinaryExpression');
});

test('ArrowFunction, with initializer and rest parameter', t => {
  const ast = parser('(c = 1, ...a) => c + a.length');
  t.is(ast.type, 'ArrowFunction');
  t.is(ast.parameters.bound.length, 1);
  t.deepEqual(ast.parameters.bound[0].initializer, { type: 'Literal', value: 1, raw: '1' });
  t.deepEqual(ast.parameters.rest, { type: 'Identifier', name: 'a', pos: 11 });
});

test('template literals', t => {
  const ast = parser('`${a} + ${b} is ${a + b}`');
  t.is(ast.type, 'TemplateLiteral');
  t.deepEqual(ast.parts[0], ['expressions', { type: 'Identifier', name: 'a', pos: 3 }]);
  t.deepEqual(ast.parts[1], ['chunks', ' + ']);
  t.deepEqual(ast.parts[2], ['expressions', { type: 'Identifier', name: 'b', pos: 10 }]);
  t.deepEqual(ast.parts[3], ['chunks', ' is ']);
  t.is(ast.parts[4][1].type, 'BinaryExpression');
});
