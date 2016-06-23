//     JavaScript Expression Parser (JSEP) <%= version %>
//     JSEP may be freely distributed under the MIT License
//     http://jsep.from.so/

/*global module: true, exports: true, console: true */
(function (root) {
  'use strict';
  // Node Types
  // ----------

  // This is the full set of types that any JSEP node can be.
  // Store them here to save space when minified
  var COMPOUND = 'Compound',
    KEYVALUE = 'KeyValue',
    IDENTIFIER = 'Identifier',
    MEMBER_EXP = 'MemberExpression',
    LITERAL = 'Literal',
    THIS_EXP = 'ThisExpression',
    CALL_EXP = 'CallExpression',
    UNARY_EXP = 'UnaryExpression',
    BINARY_EXP = 'BinaryExpression',
    LOGICAL_EXP = 'LogicalExpression',
    CONDITIONAL_EXP = 'ConditionalExpression',
    ARRAY_EXP = 'ArrayExpression',
    KEYVALUE_EXP = 'KeyValueExpression',

    PERIOD_CODE       = 46, // '.'
    COMMA_CODE        = 44, // ','
    SQUOTE_CODE       = 39, // single quote
    DQUOTE_CODE       = 34, // double quotes
    OPAREN_CODE       = 40, // (
    CPAREN_CODE       = 41, // )
    EQUALS_CODE       = 61, // =
    OBRACK_CODE       = 91, // [
    CBRACK_CODE       = 93, // ]
    QUMARK_CODE       = 63, // ?
    SEMCOL_CODE       = 59, // ;
    COLON_CODE        = 58, // :
    EXCLAMATION_CODE  = 33, // !

    throwError = function(message, index) {
      var error = new Error(message + ' at character ' + index);
      error.index = index;
      error.description = message;
      throw error;
    },

  // Operations
  // ----------

  // Set `t` to `true` to save space (when minified, not gzipped)
    t = true,
  // Use a quickly-accessible map to store all of the unary operators
  // Values are set to `true` (it really doesn't matter)
    unary_ops = {'-': t, '!': t, '~': t, '+': t},
  // Also use a map for the binary operations but set their values to their
  // binary precedence for quick reference:
  // see [Order of operations](http://en.wikipedia.org/wiki/Order_of_operations#Programming_language)
    binary_ops = {
      '||': 1, '&&': 2, '|': 3,  '^': 4,  '&': 5,
      '==': 6, '!=': 6, '===': 6, '!==': 6,
      '<': 7,  '>': 7,  '<=': 7,  '>=': 7,
      '<<':8,  '>>': 8, '>>>': 8,
      '+': 9, '-': 9,
      '*': 10, '/': 10, '%': 10
    },
    identifier_chars = [],

  // Get return the longest key length of any object
    getMaxKeyLen = function(obj) {
      var max_len = 0, len;
      for(var key in obj) {
        if((len = key.length) > max_len && obj.hasOwnProperty(key)) {
          max_len = len;
        }
      }
      return max_len;
    },
    max_unop_len = getMaxKeyLen(unary_ops),
    max_binop_len = getMaxKeyLen(binary_ops),
  // Literals
  // ----------
  // Store the values to return for the various literals we may encounter
    literals = {
      'true': true,
      'false': false,
      'null': null
    },
  // Except for `this`, which is special. This could be changed to something like `'self'` as well
    this_str = 'this',
  // Returns the precedence of a binary operator or `0` if it isn't a binary operator
    binaryPrecedence = function(op_val) {
      return binary_ops[op_val] || 0;
    },
  // Utility function (gets called from multiple places)
  // Also note that `a && b` and `a || b` are *logical* expressions, not binary expressions
    createBinaryExpression = function (operator, left, right) {
      var type = (operator === '||' || operator === '&&') ? LOGICAL_EXP : BINARY_EXP;
      return {
        type: type,
        operator: operator,
        left: left,
        right: right
      };
    },
    // `ch` is a character code in the next three functions
    isDecimalDigit = function(ch) {
      return (ch >= 48 && ch <= 57); // 0...9
    },
    isIdentifierStart = function(ch) {
      return (ch === 36) || (ch === 95) || // `$` and `_`
          (ch >= 65 && ch <= 90) || // A...Z
          (ch >= 97 && ch <= 122) || // a...z
          (identifier_chars[ch]);
    },
    isIdentifierPart = function(ch) {
      return (ch === 36) || (ch === 95) || // `$` and `_`
          (ch >= 65 && ch <= 90) || // A...Z
          (ch >= 97 && ch <= 122) || // a...z
          (ch >= 48 && ch <= 57) || // 0...9
          (identifier_chars[ch]);
    },

    // Parsing
    // -------
    // `expr` is a string with the passed in expression
    jsep = function(expr) {
      // `index` stores the character number we are currently at while `length` is a constant
      // All of the gobbles below will modify `index` as we move along
      var index = 0,
        charAtFunc = expr.charAt,
        charCodeAtFunc = expr.charCodeAt,
        exprI = function(i) { return charAtFunc.call(expr, i); },
        exprICode = function(i) { return charCodeAtFunc.call(expr, i); },
        length = expr.length,
        in_ternary = false,

        // Push `index` up to the next non-space character
        gobbleSpaces = function() {
          var ch = exprICode(index);
          // space or tab
          while(ch === 32 || ch === 9) {
            ch = exprICode(++index);
          }
        },

        // The main parsing function. Much of this code is dedicated to ternary expressions
        gobbleExpression = function() {
          var test = gobbleBinaryExpression(),
            consequent, alternate;
          gobbleSpaces();
          if(exprICode(index) === QUMARK_CODE) {
            // Ternary expression: test ? consequent : alternate
            in_ternary = true;
            index++;
            consequent = gobbleExpression();
            if(!consequent) {
              throwError('Expected expression', index);
            }
            gobbleSpaces();
            if(exprICode(index) === COLON_CODE) {
              index++;
              alternate = gobbleExpression();
              if(!alternate) {
                throwError('Expected expression', index);
              }
              in_ternary = undefined;
              return {
                type: CONDITIONAL_EXP,
                test: test,
                consequent: consequent,
                alternate: alternate
              };
            } else {
              throwError('Expected :', index);
            }
          } else {
            return test;
          }
        },

        // Search for the operation portion of the string (e.g. `+`, `===`)
        // Start by taking the longest possible binary operations (3 characters: `===`, `!==`, `>>>`)
        // and move down from 3 to 2 to 1 character until a matching binary operation is found
        // then, return that binary operation
        gobbleBinaryOp = function() {
          gobbleSpaces();
          var biop, to_check = expr.substr(index, max_binop_len), tc_len = to_check.length;
          while(tc_len > 0) {
            if(binary_ops.hasOwnProperty(to_check)) {
              index += tc_len;
              return to_check;
            }
            to_check = to_check.substr(0, --tc_len);
          }
          return false;
        },

        // This function is responsible for gobbling an individual expression,
        // e.g. `1`, `1+2`, `a+(b*2)-Math.sqrt(2)`
        gobbleBinaryExpression = function() {
          var ch_i, node, biop, prec, stack, biop_info, left, right, i, left_isolated;

          // First, try to get the leftmost thing
          // Then, check to see if there's a binary operator operating on that leftmost thing
          left = gobbleToken();
          left_isolated = exprICode(index - 1) === 32 || exprICode(index - 1) === 9;
          biop = gobbleBinaryOp();

          // If there wasn't a binary operator, just return the leftmost node
          if (!biop && left.type === IDENTIFIER && ~left.name.lastIndexOf('?') && !~left.name.substring(left.name.lastIndexOf('?'), left.name.length - 1).indexOf(':')) {
            if (left.name.charCodeAt(left.name.length - 1) === COLON_CODE) {
              var start = index;
              var alternate = gobbleExpression();
              index = start;
              if (!alternate) return left;
            }
            while (exprICode(--index) !== QUMARK_CODE) {}
            return { type: IDENTIFIER, name: left.name.substring(0, left.name.lastIndexOf('?')) };
          } else if (!biop) {
            return left;
          } else if (left.type === IDENTIFIER && isIdentifierPart(biop.charCodeAt(0)) && isIdentifierPart(exprICode(index))) {
            if (!left_isolated) { return { type: IDENTIFIER, name: left.name + biop + gobbleIdentifier().name }; }
          }

          // Otherwise, we need to start a stack to properly place the binary operations in their
          // precedence structure
          biop_info = { value: biop, prec: binaryPrecedence(biop)};

          right = gobbleToken();
          if(!right) {
            throwError("Expected expression after " + biop, index);
          }
          stack = [left, biop_info, right];

          // Properly deal with precedence using [recursive descent](http://www.engr.mun.ca/~theo/Misc/exp_parsing.htm)
          while((biop = gobbleBinaryOp())) {
            prec = binaryPrecedence(biop);

            if(prec === 0) {
              break;
            }
            biop_info = { value: biop, prec: prec };

            // Reduce: make a binary expression from the three topmost entries.
            while ((stack.length > 2) && (prec <= stack[stack.length - 2].prec)) {
              right = stack.pop();
              biop = stack.pop().value;
              left = stack.pop();
              node = createBinaryExpression(biop, left, right);
              stack.push(node);
            }

            node = gobbleToken();
            if(!node) {
              throwError("Expected expression after " + biop, index);
            }
            stack.push(biop_info, node);
          }

          i = stack.length - 1;
          node = stack[i];
          while(i > 1) {
            node = createBinaryExpression(stack[i - 1].value, stack[i - 2], node);
            i -= 2;
          }
          return node;
        },

        // An individual part of a binary expression:
        // e.g. `foo.bar(baz)`, `1`, `"abc"`, `(a % 2)` (because it's in parenthesis)
        gobbleToken = function() {
          var ch, to_check, tc_len, node, kvExp, id;

          gobbleSpaces();
          ch = exprICode(index);

          if(isDecimalDigit(ch) || ch === PERIOD_CODE) {
            var start = index;
            // Char code 46 is a dot `.` which can start off a numeric literal
            try {
              return gobbleNumericLiteral();
            } catch (e) {
              index = start;
              node = gobbleVariable();
            }
          } else if(ch === SQUOTE_CODE || ch === DQUOTE_CODE) {
            // Single or double quotes
            var string = gobbleStringLiteral();
            if (ch === SQUOTE_CODE && exprICode(index) === EXCLAMATION_CODE) {
              index++;
              id = gobbleIdentifier();
              return {
                type: IDENTIFIER,
                name: string.raw + '!' + id.name,
                object: { type: IDENTIFIER, name: string.value },
                property: { type: IDENTIFIER, name: id.name }
              };
            } else {
              return string;
            }
          } else if(isIdentifierStart(ch) || ch === OPAREN_CODE) { // open parenthesis
            // `foo`, `bar.baz`
            node = gobbleVariable();
            if (node.type === IDENTIFIER && exprICode(index) === EXCLAMATION_CODE) {
              index++;
              id = gobbleIdentifier();
              node.object = { type: IDENTIFIER, name: node.name };
              node.property = { type: IDENTIFIER, name: id.name };
              node.name = node.name + '!' + id.name;
            }
          } else if (ch === OBRACK_CODE) {
            return gobbleArray();
          } else {
            to_check = expr.substr(index, max_unop_len);
            tc_len = to_check.length;
            while(tc_len > 0) {
              if(unary_ops.hasOwnProperty(to_check)) {
                index += tc_len;
                return {
                  type: UNARY_EXP,
                  operator: to_check,
                  argument: gobbleToken(),
                  prefix: true
                };
              }
              to_check = to_check.substr(0, --tc_len);
            }

            return false;
          }

          if (node && node.type === IDENTIFIER && unary_ops.hasOwnProperty(node.name)) {
            return {
              type: UNARY_EXP,
              operator: node.name,
              argument: gobbleToken(),
              prefix: true
            };
          } else if (node && node.type === IDENTIFIER && (+node.name || +node.name === 0)) {
            return {
              type: LITERAL,
              value: parseFloat(node.name),
              raw: node.name
            };
          }
          while (node && node.type === KEYVALUE) {
            kvExp = kvExp || { type: KEYVALUE_EXP, keys: {} };
            if (Array.isArray(kvExp.keys[node.key])) kvExp.keys[node.key].push(node.value);
            else if (kvExp.keys[node.key] !== undefined) kvExp.keys[node.key] = [ kvExp.keys[node.key], node.value ];
            else kvExp.keys[node.key] = node.value;
            gobbleSpaces();
            if (exprICode(index) === COMMA_CODE) index++;
            gobbleSpaces();
            if (!isIdentifierStart(exprICode(index))) break;
            node = gobbleVariable();
          }
          return kvExp || node;
        },
        // Parse simple numeric literals: `12`, `3.4`, `.5`. Do this by using a string to
        // keep track of everything in the numeric literal and then calling `parseFloat` on that string
        gobbleNumericLiteral = function() {
          var number = '', ch, chCode, i, rest, start;
          while(isDecimalDigit(exprICode(index))) {
            number += exprI(index++);
          }

          if(exprICode(index) === PERIOD_CODE) { // can start with a decimal marker
            number += exprI(index++);

            while(isDecimalDigit(exprICode(index))) {
              number += exprI(index++);
            }
          }

          ch = exprI(index);
          if(ch === 'e' || ch === 'E') { // exponent marker
            number += exprI(index++);
            ch = exprI(index);
            if(ch === '+' || ch === '-') { // exponent sign
              number += exprI(index++);
            }
            while(isDecimalDigit(exprICode(index))) { //exponent itself
              number += exprI(index++);
            }
            if(!isDecimalDigit(exprICode(index-1)) ) {
              for (i = 0; i < number.length; i++) {
                if (!isIdentifierPart(number.charCodeAt(i))) {
                  throwError('Expected exponent (' + number + exprI(index) + ')', index);
                }
              }
              rest = gobbleIdentifier();
              return {
                type: IDENTIFIER,
                name: number + rest.name
              };
            }
          }

          if (exprICode(index) === COLON_CODE && in_ternary) {
            return {
              type: LITERAL,
              value: parseFloat(number),
              raw: number
            };
          }

          chCode = exprICode(index);
          // Check to make sure this isn't a variable name that start with a number (123abc)
          if(isIdentifierStart(chCode)) {

            for (i = 0; i < number.length; i++) {
              if (!isIdentifierPart(number.charCodeAt(i))) {
                throwError('Variable names cannot start with a number (' +
                  number + exprI(index) + ')', index);
              }
            }
            rest = gobbleIdentifier();
            return {
              type: IDENTIFIER,
              name: number + rest.name
            };
          } else if(chCode === PERIOD_CODE) {
            throwError('Unexpected period', index);
          }

          return {
            type: LITERAL,
            value: parseFloat(number),
            raw: number
          };
        },

        // Parses a string literal, staring with single or double quotes with basic support for escape codes
        // e.g. `"hello world"`, `'this is\nJSEP'`
        gobbleStringLiteral = function() {
          var str = '', quote = exprI(index++), closed = false, ch;

          while(index < length) {
            ch = exprI(index++);
            if(ch === quote) {
              closed = true;
              break;
            } else if(ch === '\\') {
              // Check for all of the common escape codes
              ch = exprI(index++);
              switch(ch) {
                case 'n': str += '\n'; break;
                case 'r': str += '\r'; break;
                case 't': str += '\t'; break;
                case 'b': str += '\b'; break;
                case 'f': str += '\f'; break;
                case 'v': str += '\x0B'; break;
                case '\\': str += '\\'; break;
              }
            } else {
              str += ch;
            }
          }

          if(!closed) {
            throwError('Unclosed quote after "'+str+'"', index);
          }

          return {
            type: LITERAL,
            value: str,
            raw: quote + str + quote
          };
        },

        // Gobbles only identifiers
        // e.g.: `foo`, `_value`, `$x1`
        // Also, this function checks if that identifier is a literal:
        // (e.g. `true`, `false`, `null`) or `this`
        gobbleIdentifier = function() {
          var ch = exprICode(index), start = index, identifier;

          if(isIdentifierStart(ch)) {
            index++;
          } else {
            throwError('Unexpected ' + exprI(index), index);
          }

          while(index < length) {
            ch = exprICode(index);
            if(isIdentifierPart(ch)) {
              index++;
            } else if (ch === EQUALS_CODE) {
              identifier = expr.slice(start, index++);
              var value = gobbleExpression();
              return { type: KEYVALUE, key: identifier, value: value };
            } else {
              break;
            }
          }
          identifier = expr.slice(start, index);

          if(literals.hasOwnProperty(identifier)) {
            return {
              type: LITERAL,
              value: literals[identifier],
              raw: identifier
            };
          } else if(identifier === this_str) {
            return { type: THIS_EXP };
          } else {
            return {
              type: IDENTIFIER,
              name: identifier
            };
          }
        },

        // Gobbles a list of arguments within the context of a function call
        // or array literal. This function also assumes that the opening character
        // `(` or `[` has already been gobbled, and gobbles expressions and commas
        // until the terminator character `)` or `]` is encountered.
        // e.g. `foo(bar, baz)`, `my_func()`, or `[bar, baz]`
        gobbleArguments = function(termination) {
          var ch_i, args = [], node;
          while(index < length) {
            gobbleSpaces();
            var start = index;
            ch_i = exprICode(index);
            if(ch_i === termination) { // done parsing
              index++;
              break;
            } else if (ch_i === COMMA_CODE) { // between expressions
              index++;
            } else {
              node = gobbleExpression();
              if(!node || node.type === COMPOUND) {
                throwError('Expected comma', index);
              }
              args.push(node);
            }
          }
          return args;
        },

        // Gobble a non-literal variable name. This variable name may include properties
        // e.g. `foo`, `bar.baz`, `foo['bar'].baz`
        // It also gobbles function calls:
        // e.g. `Math.acos(obj.angle)`
        gobbleVariable = function() {
          var ch_i, node;
          ch_i = exprICode(index);

          if(ch_i === OPAREN_CODE) {
            node = gobbleGroup();
          } else {
            node = gobbleIdentifier();
          }
          gobbleSpaces();
          ch_i = exprICode(index);
          while(ch_i === PERIOD_CODE || ch_i === OBRACK_CODE || ch_i === OPAREN_CODE) {
            index++;
            if(ch_i === PERIOD_CODE) {
              gobbleSpaces();
              node = {
                type: MEMBER_EXP,
                computed: false,
                object: node,
                property: gobbleIdentifier()
              };
            } else if(ch_i === OBRACK_CODE) {
              node = {
                type: MEMBER_EXP,
                computed: true,
                object: node,
                property: gobbleExpression()
              };
              gobbleSpaces();
              ch_i = exprICode(index);
              if(ch_i !== CBRACK_CODE) {
                throwError('Unclosed [', index);
              }
              index++;
            } else if(ch_i === OPAREN_CODE) {
              // A function call is being made; gobble all the arguments
              node = {
                type: CALL_EXP,
                'arguments': gobbleArguments(CPAREN_CODE),
                callee: node
              };
            }
            gobbleSpaces();
            ch_i = exprICode(index);
          }
          return node;
        },

        // Responsible for parsing a group of things within parentheses `()`
        // This function assumes that it needs to gobble the opening parenthesis
        // and then tries to gobble everything within that parenthesis, assuming
        // that the next thing it should see is the close parenthesis. If not,
        // then the expression probably doesn't have a `)`
        gobbleGroup = function() {
          index++;
          var node = gobbleExpression();
          gobbleSpaces();
          if(exprICode(index) === CPAREN_CODE) {
            index++;
            return node;
          } else {
            throwError('Unclosed (', index);
          }
        },

        // Responsible for parsing Array literals `[1, 2, 3]`
        // This function assumes that it needs to gobble the opening bracket
        // and then tries to gobble the expressions as arguments.
        gobbleArray = function() {
          index++;
          return {
            type: ARRAY_EXP,
            elements: gobbleArguments(CBRACK_CODE)
          };
        },

        nodes = [], ch_i, node;

      while(index < length) {
        ch_i = exprICode(index);

        // Expressions can be separated by semicolons, commas, or just inferred without any
        // separators
        if(ch_i === SEMCOL_CODE || ch_i === COMMA_CODE) {
          index++; // ignore separators
        } else {
          // Try to gobble each expression individually
          if((node = gobbleExpression())) {
            nodes.push(node);
          // If we weren't able to find a binary expression and are out of room, then
          // the expression passed in probably has too much
          } else if(index < length) {
            throwError('Unexpected "' + exprI(index) + '"', index);
          }
        }
      }

      // If there's only one expression just try returning the expression
      if(nodes.length === 1) {
        return nodes[0];
      } else {
        return {
          type: COMPOUND,
          body: nodes
        };
      }
    };

  // To be filled in by the template
  jsep.version = '<%= version %>';
  jsep.toString = function() { return 'JavaScript (Extended) Expression Parser (JSEP) v' + jsep.version; };

  /**
   * @method jsep.addUnaryOp
   * @param {string} op_name The name of the unary op to add
   * @return jsep
   */
  jsep.addUnaryOp = function(op_name) {
    unary_ops[op_name] = t; return this;
  };

  /**
   * @method jsep.addBinaryOp
   * @param {string} op_name The name of the binary op to add
   * @param {number} precedence The precedence of the binary op (can be a float)
   * @return jsep
   */
  jsep.addBinaryOp = function(op_name, precedence) {
    max_binop_len = Math.max(op_name.length, max_binop_len);
    binary_ops[op_name] = precedence;
    return this;
  };

  /**
   * @method jsep.addIdentifierChars
   * @param {string} chars Characters to
   * @param {number} precedence The precedence of the binary op (can be a float)
   * @return jsep
   */
  jsep.addIdentifierChars = function(chars) {
    for (var i = 0; i < chars.length; i++) {
      identifier_chars[chars.charCodeAt(i)] = 1;
    }
    return this;
  };

  /**
   * @method jsep.removeUnaryOp
   * @param {string} op_name The name of the unary op to remove
   * @return jsep
   */
  jsep.removeUnaryOp = function(op_name) {
    delete unary_ops[op_name];
    if(op_name.length === max_unop_len) {
      max_unop_len = getMaxKeyLen(unary_ops);
    }
    return this;
  };

  /**
   * @method jsep.removeBinaryOp
   * @param {string} op_name The name of the binary op to remove
   * @return jsep
   */
  jsep.removeBinaryOp = function(op_name) {
    delete binary_ops[op_name];
    if(op_name.length === max_binop_len) {
      max_binop_len = getMaxKeyLen(binary_ops);
    }
    return this;
  };

  /**
   * @method jsep.removeIdentifierChars
   * @param {string} chars Characters to disallow in identifier names
   * @return jsep
   */
  jsep.removeIdentifierChars = function(chars) {
    for (var i = 0; i < chars.length; i++) {
      identifier_chars[chars.charCodeAt(i)] = 0;
    }
    return this;
  };

  // In desktop environments, have a way to restore the old value for `jsep`
  if (typeof exports === 'undefined') {
    var old_jsep = root.jsep;
    // The star of the show! It's a function!
    root.jsep = jsep;
    // And a courteous function willing to move out of the way for other similarly-named objects!
    jsep.noConflict = function() {
      if(root.jsep === jsep) {
        root.jsep = old_jsep;
      }
      return jsep;
    };
  } else {
    // In Node.JS environments
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = jsep;
    } else {
      exports.parse = jsep;
    }
  }
}(this));
