import { functions } from './interpreter-functions';
const functFlag = '@';

export async function interpret(input, values = {}) {
  try {
    const tokens = lex(input);
    const parseTree = parse(tokens);
    const output = await evaluate(parseTree, values);
    return output;
  } catch (err) {
    throw err;
  }
}

/**
 * Lexer that tokenizes input
 * @param {string} input
 * @returns {{type: string, value: string}[]} tokens
 */
function lex(input) {
  const isParenthesisOperator = c => /[\(\)]/.test(c);
  const isCommaOperator = c => c === ',' && !(/['"]/.test(input[i - 1]) && /['"]/.test(input[i + 1]));
  const isOperator = c => isParenthesisOperator(c) || isCommaOperator(c);
  const isDigit = c => /\d/.test(c);
  const isWhiteSpace = c => /\s/.test(c); // Includes spaces, tabs, newlines, etc.
  const isIdentifier = c => c === functFlag;
  const isFunction = c => typeof c === 'string' && c.startsWith(functFlag) && functions[c.toLowerCase().substring(1)];
  const isString = c => typeof c === 'string' && !isOperator(c) && !isDigit(c) && !isWhiteSpace(c) && !isIdentifier(c);

  const tokens = [];
  let c;
  let i = 0;

  const advance = () => (c = input[++i]);

  const addToken = (type, value = c) => tokens.push({ type, value });

  while (i < input.length) {
    c = input[i];

    if (isWhiteSpace(c)) {
      let whitespace = '';
      do {
        whitespace += c;
      } while (isWhiteSpace(advance()));

      addToken('whitespace', whitespace);
    } else if (isOperator(c)) {
      addToken('operator', c);
      advance();
    } else if (isDigit(c)) {
      let num = c;
      while (isDigit(advance())) num += c;
      if (c === '.') {
        do num += c;
        while (isDigit(advance()));
      }

      addToken('number', num);
    } else if (isIdentifier(c)) {
      let idn = c;
      while (isString(advance())) idn += c;
      if (isFunction(idn)) {
        addToken('identifier', idn);
      } else {
        addToken('string', idn);
      }
    } else if (isString(c)) {
      let str = '';
      do {
        str += c;
      } while (
        isString(advance()) ||
        (c !== undefined &&
          (str === "'" ||
            (str.startsWith("'") && !str.endsWith("'")) ||
            str === '"' ||
            (str.startsWith('"') && !str.endsWith('"'))))
      );

      addToken('string', str);
    } else {
      throw new Error(`Lexer: Unrecognized character '${c}' at position ${i} in '${input}'`);
    }
  }

  if (!input.length) {
    // For empty string
    addToken('string', '');
  }
  addToken('(end)');
  return tokens;
}

/**
 * Parser
 * @param {{type: string, value: string}[]} tokens
 * @returns {Array}
 */
function parse(tokens) {
  let i = 0;
  const token = () => tokens[i];

  const advance = () => {
    i++;
    return token();
  };

  const skipWhitespace = () => {
    while (token().type === 'whitespace') {
      advance();
    }
  };

  const parseIdentifier = (identifier = token()) => {
    const args = [];

    advance(); // Move to next token after identifier

    if (token().type === 'operator' && token().value === '(') {
      advance(); // Move past '('

      skipWhitespace();

      if (token().type === 'operator' && token().value === ')') {
        advance(); // Handle empty argument list
      } else {
        do {
          if (token().type === 'operator' && token().value === ',') {
            advance(); // Skip comma and move to the next argument
          }
          skipWhitespace(); // Ignore leading whitespace

          if (token().type === 'identifier') {
            args.push(parseIdentifier(token()));
          } else if (token().type === 'number' || token().type === 'string') {
            args.push(token());
            advance();
          } else {
            throw new Error('Unexpected token: ' + token().value);
          }

          skipWhitespace(); // Ignore trailing whitespace
        } while (
          token().type !== '(end)' &&
          (token().type !== 'operator' || (token().type === 'operator' && token().value === ','))
        );

        if (token().type !== 'operator' || token().value !== ')') {
          throw new Error('Expected closing parenthesis, but found: ' + token().value);
        }

        advance(); // Move past closing ')'
      }

      return {
        type: 'call',
        name: identifier.value.toLowerCase(),
        args
      };
    } else {
      throw new Error('Unexpected token after identifier: ' + token().value);
    }
  };

  const parseTree = [];
  while (token().type !== '(end)') {
    if (token().type === 'identifier') {
      parseTree.push(parseIdentifier(token()));
    } else {
      parseTree.push(token());
      advance();
    }
  }

  return parseTree;
}

/**
 * Evaluator
 * @param parseTree
 * @param values
 * @returns {Promise<any>}
 */
async function evaluate(parseTree, values) {
  const variables = {
    pi: Math.PI,
    e: Math.E
  };

  let args = {};

  const parseNode = async node => {
    if (node.type === 'number' || node.type === 'string' || node.type === 'whitespace') {
      return node.value;
    } else if (node.type === 'identifier') {
      const value = args.hasOwnProperty(node.value) ? args[node.value] : variables[node.value];
      if (typeof value === 'undefined') throw new Error(node.value + ' is undefined');
      return value;
    } else if (node.type === 'assign') {
      variables[node.name] = await parseNode(node.value);
    } else if (node.type === 'call') {
      for (let i = 0; i < node.args.length; i++) {
        node.args[i] = await parseNode(node.args[i]);
        if (typeof node.args[i] === 'string') {
          node.args[i] = node.args[i].replace(/^['"](.*)['"]$/, '$1');
        }
      }

      // GETVALUE / GETVALUEESCAPE / GETVALUEUNESCAPE:
      const _name = node.name.toLowerCase().substring(1);
      if (['gvescape', 'getvalueescape', 'gvunescape', 'getvalueunescape'].indexOf(_name) !== -1) {
        node.args[1] = values;
      } else if (['gv', 'getvalue', 'gvq', 'getvaluequoted'].indexOf(_name) !== -1) {
        node.args[2] = values;
      }

      return await functions[node.name.toLowerCase().substring(1)].apply(null, node.args);
    } else if (node.type === 'function') {
      functions[node.name.toLowerCase().substring(1)] = async () => {
        for (let i = 0; i < node.args.length; i++) {
          args[node.args[i].value] = arguments[i];
        }
        const ret = await parseNode(node.value);
        args = {};
        return ret;
      };
    }
  };

  let output;

  for (const node of parseTree) {
    const value = await parseNode(node);

    if (value !== undefined) {
      if (typeof value === 'string') {
        output = (output || '') + value;
      } else {
        output = output === undefined ? value : output + value;
      }
    }
  }

  return output;
}
