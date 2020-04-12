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
  t.deepEqual(ast.chunks, [' + ', ' is ']);
  t.is(ast.expressions[0].type, 'Identifier');
  t.is(ast.expressions[1].type, 'Identifier');
  t.is(ast.expressions[2].type, 'BinaryExpression');
});
