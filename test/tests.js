var esprima = require('./esprima')
var jsep = require('..')()
var test = require('ava').test

var binops = {
	"+" : function(a, b) { return a + b; },
	"-" : function(a, b) { return a - b; },
	"*" : function(a, b) { return a * b; },
	"/" : function(a, b) { return a / b; },
	"%" : function(a, b) { return a % b; }
};

var unops = {
	"-" : function(a) { return -a; },
	"+" : function(a) { return -a; }
};

var do_eval = function(node) {
	if(node.type === "BinaryExpression") {
		return binops[node.operator](do_eval(node.left), do_eval(node.right));
	} else if(node.type === "UnaryExpression") {
		return unops[node.operator](do_eval(node.argument));
	} else if(node.type === "Literal") {
		return node.value;
	}
};

var test_op_expession = function(t, str) {
	t.is(do_eval(jsep(str)), eval(str));
};

var filter_props = function(larger, smaller) {
	var rv = (typeof larger.length === 'number') ? [] : {};
	var prop_val;
	for(var prop_name in smaller) {
		prop_val  = smaller[prop_name];
		if(typeof prop_val === 'string' || typeof prop_val === 'number') {
			rv[prop_name] = larger[prop_name];
		} else {
			rv[prop_name] = filter_props(larger[prop_name], prop_val);
		}
	}
	return rv;
};

var parse = jsep;
var test_parser = function(t, inp, out) {
	var parse_val = parse(inp);
	return t.deepEqual(filter_props(parse_val, out), out);
};

var esprima_comparison_test = function(t) {
	return function(str) {
		var jsep_val = jsep(str),
			esprima_val = esprima.parse(str);
		return t.deepEqual(jsep_val, esprima_val.body[0].expression);
	}
};


test('Constants', function(t) {
	test_parser(t, "'abc'", {value: "abc"});
	test_parser(t, '"abc"', {value: "abc"});
	test_parser(t, "123", {value: 123});
	test_parser(t, "12.3", {value: 12.3});
});

test('Variables', function(t) {
	test_parser(t, "abc", {name: "abc"});
	test_parser(t, "a.b[c[0]]", {
		property: {
			type: "MemberExpression"
		}
	});
});

test('Function Calls', function(t) {
	//test_parser(t, "a(b, c(d,e), f)", {});
	test_parser(t, "a b + c", {});
	test_parser(t, ";", {});
});

test('Arrays', function(t) {
	test_parser(t, "[]", {type: 'ArrayExpression', elements: []});

	test_parser(t, "[a]", {
		type: 'ArrayExpression',
		elements: [{type: 'Identifier', name: 'a'}]
	});
});

test('Ops', function(t) {
	test_op_expession(t, "1");
	test_op_expession(t, "1+2");
	test_op_expession(t, "1*2");
	test_op_expession(t, "1*(2+3)");
	test_op_expession(t, "(1+2)*3");
	test_op_expession(t, "(1+2)*3+4-2-5+2/2*3");
	test_op_expession(t, "1 + 2-   3*	4 /8");
});

test('Custom ops', function(t) {
	jsep.addBinaryOp("^", 10);
	test_parser(t, "a^b", {});
});

test('Bad Numbers', function(t) {
	test_parser(t, "1.", {type: "Literal", value: 1, raw: "1."});
	try {
		var x = jsep("1.2.3");
		console.log(x);
		t.fail();
	} catch(e) {
		t.pass();
	}
});

test('Esprima Comparison', function(t) {
	([
		" true",
		"false ",
		" 1.2 ",
		" .2 ",
		"a",
		"a .b",
		"a.b. c",
		"a [b]",
		"a.b  [ c ] ",
		"$foo[ bar][ baz].other12 ['lawl'][12]",
		"$foo     [ 12	] [ baz[z]    ].other12*4 + 1 ",
		"$foo[ bar][ baz]    (a, bb ,   c  )   .other12 ['lawl'][12]",
		"(a(b(c[!d]).e).f+'hi'==2) === true",
		"(Object.variable.toLowerCase()).length == 3",
		"(Object.variable.toLowerCase())  .  length == 3",
		"[1] + [2]"
	]).map(esprima_comparison_test(t));
});

test('Ternary', function(t) {
	var val = jsep('a ? b : c');
	t.is(val.type, 'ConditionalExpression');
	val = jsep('a||b ? c : d');
	t.is(val.type, 'ConditionalExpression');
});

test('Named Arguments', function(t) {
	var val = jsep('named(arg1="hi", arg2="bye")');
	t.is(val.type, 'CallExpression');
	t.is(val.callee.type, 'Identifier');
	t.is(val.callee.name, 'named');
	t.is(val.arguments[0].type, 'KeyValueExpression');
	t.is(val.arguments[0].keys.arg1.type, 'Literal');
	t.is(val.arguments[0].keys.arg1.raw, '"hi"');
	t.is(val.arguments[0].keys.arg1.value, 'hi');
	t.is(val.arguments[0].keys.arg2.type, 'Literal');
	t.is(val.arguments[0].keys.arg2.raw, '"bye"');
	t.is(val.arguments[0].keys.arg2.value, 'bye');

	var val = jsep('named(arg1="hi" arg2="bye")');
	t.is(val.type, 'CallExpression');
	t.is(val.callee.type, 'Identifier');
	t.is(val.callee.name, 'named');
	t.is(val.arguments[0].type, 'KeyValueExpression');
	t.is(val.arguments[0].keys.arg1.type, 'Literal');
	t.is(val.arguments[0].keys.arg1.raw, '"hi"');
	t.is(val.arguments[0].keys.arg1.value, 'hi');
	t.is(val.arguments[0].keys.arg2.type, 'Literal');
	t.is(val.arguments[0].keys.arg2.raw, '"bye"');
	t.is(val.arguments[0].keys.arg2.value, 'bye');
});

test('Key-Value Expressions', function(t) {
	var val = jsep('named[arg1="hi", arg2="bye"]');
	t.is(val.type, 'MemberExpression')
	t.is(val.computed, true)
	t.is(val.object.name, 'named')
	t.is(val.property.type, 'KeyValueExpression')
	t.is(val.property.keys.arg1.type, 'Literal');
	t.is(val.property.keys.arg1.raw, '"hi"');
	t.is(val.property.keys.arg1.value, 'hi');
	t.is(val.property.keys.arg2.type, 'Literal');
	t.is(val.property.keys.arg2.raw, '"bye"');
	t.is(val.property.keys.arg2.value, 'bye');

	val = jsep('named[arg1="hi" arg2="bye" , arg3=4, arg3=5]');
	t.is(val.type, 'MemberExpression')
	t.is(val.computed, true)
	t.is(val.object.name, 'named')
	t.is(val.property.type, 'KeyValueExpression')
	t.is(val.property.keys.arg1.type, 'Literal');
	t.is(val.property.keys.arg1.raw, '"hi"');
	t.is(val.property.keys.arg1.value, 'hi');
	t.is(val.property.keys.arg2.type, 'Literal');
	t.is(val.property.keys.arg2.raw, '"bye"');
	t.is(val.property.keys.arg2.value, 'bye');
	t.is(val.property.keys.arg3[0].value, 4);
	t.is(val.property.keys.arg3[1].value, 5);
});

test('Special Identifiers', function(t) {
	jsep.addIdentifierChars('1+%@?:');

	var val = jsep('%wghi:@');
	t.is(val.type, 'Identifier');
	t.is(val.name, '%wghi:@');

	val = jsep('+%wghi:@');
	t.is(val.type, 'Identifier');
	t.is(val.name, '+%wghi:@');

	val = jsep('+ %wghi:@');
	t.is(val.type, 'UnaryExpression');
	t.is(val.argument.name, '%wghi:@');
	t.is(val.argument.type, 'Identifier');
	t.is(val.operator, '+');
	t.is(val.prefix, true)

	val = jsep('a+%wghi:@');
	t.is(val.type, 'Identifier');
	t.is(val.name, 'a+%wghi:@');

	val = jsep('a +%wghi:@');
	t.is(val.type, 'BinaryExpression');
	t.is(val.operator, '+');
	t.is(val.left.name, 'a');
	t.is(val.left.type, 'Identifier');
	t.is(val.right.name, '%wghi:@');
	t.is(val.right.type, 'Identifier');

	val = jsep('a + %wghi:@');
	t.is(val.type, 'BinaryExpression');
	t.is(val.operator, '+');
	t.is(val.left.name, 'a');
	t.is(val.left.type, 'Identifier');
	t.is(val.right.name, '%wghi:@');
	t.is(val.right.type, 'Identifier');

	val = jsep('a?1:2');
	t.is(val.type, 'Identifier');
	t.is(val.name, 'a?1:2');

	val = jsep('a ? 1 : 2');
	t.is(val.type, 'ConditionalExpression')
	t.is(val.test.type, 'Identifier')
	t.is(val.test.name, 'a')
	t.is(val.consequent.value, 1)
	t.is(val.alternate.value, 2)

	val = jsep('a ?1:2')
	t.is(val.type, 'ConditionalExpression')
	t.is(val.test.type, 'Identifier')
	t.is(val.test.name, 'a')
	t.is(val.consequent.value, 1)
	t.is(val.alternate.value, 2)

	val = jsep('a ?1 :2')
	t.is(val.type, 'ConditionalExpression')
	t.is(val.test.type, 'Identifier')
	t.is(val.test.name, 'a')
	t.is(val.consequent.value, 1)
	t.is(val.alternate.value, 2)

	val = jsep('a ?1: 2')
	t.is(val.type, 'ConditionalExpression')
	t.is(val.test.type, 'Identifier')
	t.is(val.test.name, 'a')
	t.is(val.consequent.value, 1)
	t.is(val.alternate.value, 2)

	val = jsep('a ? 1:2')
	t.is(val.type, 'ConditionalExpression')
	t.is(val.test.type, 'Identifier')
	t.is(val.test.name, 'a')
	t.is(val.consequent.value, 1)
	t.is(val.alternate.value, 2)

	val = jsep('a? 1:2')
	t.is(val.type, 'ConditionalExpression')
	t.is(val.test.type, 'Identifier')
	t.is(val.test.name, 'a')
	t.is(val.consequent.value, 1)
	t.is(val.alternate.value, 2)

	val = jsep('a?1 :2')
	t.is(val.type, 'ConditionalExpression')
	t.is(val.test.type, 'Identifier')
	t.is(val.test.name, 'a')
	t.is(val.consequent.value, 1)
	t.is(val.alternate.value, 2)

	val = jsep('a?1: 2')
	t.is(val.type, 'ConditionalExpression')
	t.is(val.test.type, 'Identifier')
	t.is(val.test.name, 'a')
	t.is(val.consequent.value, 1)
	t.is(val.alternate.value, 2)

	val = jsep('a?1:');
	t.is(val.type, 'Identifier');
	t.is(val.name, 'a?1:');

	val = jsep('1');
	t.is(val.type, 'Literal');
	t.is(val.value, 1);

	val = jsep('1e2');
	t.is(val.type, 'Literal');
	t.is(val.value, 100);

	val = jsep('1ebit');
	t.is(val.type, 'Identifier')
	t.is(val.name, '1ebit');

	val = jsep('1.1ebit');
	t.is(val.type, 'MemberExpression');
	t.is(val.computed, false);
	t.is(val.object.type, 'Identifier');
	t.is(val.object.name, '1');
	t.is(val.property.type, 'Identifier');
	t.is(val.property.name, '1ebit');

	val = jsep('1.1');
	t.is(val.type, 'Literal');
	t.is(val.value, 1.1);

	val = jsep('1.1.1');
	t.is(val.type, 'MemberExpression');
	t.is(val.computed, false);
	t.is(val.object.type, 'MemberExpression');
	t.is(val.object.object.name, '1');
	t.is(val.object.property.name, '1');
	t.is(val.property.type, 'Identifier');
	t.is(val.property.name, '1');

	val = jsep('1.1e');
	t.is(val.type, 'MemberExpression');
	t.is(val.computed, false);
	t.is(val.object.type, 'Identifier');
	t.is(val.object.name, '1');
	t.is(val.property.type, 'Identifier');
	t.is(val.property.name, '1e');

	val = jsep('1.1e1');
	t.is(val.type, 'Literal');
	t.is(val.value, 11);

	jsep.removeIdentifierChars('1+%@?:');

	val = jsep('Group!prop');
	t.is(val.type, 'Identifier')
	t.is(val.name, 'Group!prop')
	t.is(val.object.type, 'Identifier')
	t.is(val.object.name, 'Group')
	t.is(val.property.type, 'Identifier')
	t.is(val.property.name, 'prop')

	val = jsep("'Group 1'!prop");
	t.is(val.type, 'Identifier')
	t.is(val.name, "'Group 1'!prop")
	t.is(val.object.type, 'Identifier')
	t.is(val.object.name, "Group 1")
	t.is(val.property.type, 'Identifier')
	t.is(val.property.name, 'prop')
})
