const Parser = require('rd-parse');
const Grammar = require('./grammar');

describe('Testing jsexpr grammar', () => {

  const parser = Parser(Grammar);

  it('tests Identifier', () => {
    let ast = parser(' bla ');
    expect(ast).toEqual({ type: 'Identifier', name: 'bla', pos: 1 });
  });

  it('tests a string literal', () => {
    let ast = parser(' "bla \\" bla" ');
    expect(ast).toEqual({ type: 'Literal', value: 'bla " bla', raw: '"bla \\" bla"' });
  });

  it('tests a number literal', () => {
    let ast = parser(' 5e2 ');
    expect(ast).toEqual({ type: 'Literal', value: 500, raw: '5e2' });
  });

  it('tests ArrowFunction, simple', () => {
    let ast = parser('x => x * x');
    expect(ast.type).toBe('ArrowFunction');
    expect(ast.parameters.bound.length).toBe(1);
    expect(ast.parameters.bound[0]).toEqual({ type: 'Identifier', name: 'x', pos: 0 });
    expect(ast.parameters.rest).toBeUndefined();
    expect(ast.result.type).toBe('BinaryExpression');
  });

  it('tests ArrowFunction, with initializer and rest parameter', () => {
    let ast = parser('(c = 1, ...a) => c + a.length');
    expect(ast.type).toBe('ArrowFunction');
    expect(ast.parameters.bound.length).toBe(1);
    expect(ast.parameters.bound[0].initializer).toEqual({ type: 'Literal', value: 1, raw: '1' });
    expect(ast.parameters.rest).toEqual({ type: 'Identifier', name: 'a', pos: 11 });
  });

});
