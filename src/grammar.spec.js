const Parser = require('rd-parse');
const Grammar = require('./grammar');

describe('Testing jsexpr grammar', () => {

  let parser;
  beforeEach(() => {
    parser = new Parser(Grammar);
  });

  it('tests Identifier', () => {
    let ast = parser.parse('bla');
    expect(ast).toEqual({ type: 'Identifier', name: 'bla', anchors: [0, 3] });
  });

});
