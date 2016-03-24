(function() {
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

var test_op_expession = function(str) {
	equal(do_eval(jsep(str)), eval(str));
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
var test_parser = function(inp, out) {
	var parse_val = parse(inp);
	return deepEqual(filter_props(parse_val, out), out);
};
var esprima_comparison_test = function(str) {
	var jsep_val = jsep(str),
		esprima_val = esprima.parse(str);
	return deepEqual(jsep_val, esprima_val.body[0].expression);
};

module("Expression Parser");

test('Constants', function() {
	test_parser("'abc'", {value: "abc"});
	test_parser('"abc"', {value: "abc"});
	test_parser("123", {value: 123});
	test_parser("12.3", {value: 12.3});
});

test('Variables', function() {
	test_parser("abc", {name: "abc"});
	test_parser("a.b[c[0]]", {
		property: {
			type: "MemberExpression"
		}
	});
});

test('Function Calls', function() {
	//test_parser("a(b, c(d,e), f)", {});
	test_parser("a b + c", {});
	test_parser(";", {});
});

test('Arrays', function() {
	test_parser("[]", {type: 'ArrayExpression', elements: []});

	test_parser("[a]", {
		type: 'ArrayExpression',
		elements: [{type: 'Identifier', name: 'a'}]
	});
});

test('Ops', function() {
	test_op_expession("1");
	test_op_expession("1+2");
	test_op_expession("1*2");
	test_op_expession("1*(2+3)");
	test_op_expession("(1+2)*3");
	test_op_expession("(1+2)*3+4-2-5+2/2*3");
	test_op_expession("1 + 2-   3*	4 /8");
});

test('Custom ops', function() {
	jsep.addBinaryOp("^", 10);
	test_parser("a^b", {});
});

test('Bad Numbers', function() {
	test_parser("1.", {type: "Literal", value: 1, raw: "1."});
	try {
		var x = jsep("1.2.3");
		console.log(x);
		ok(false);
	} catch(e) {
		ok(true);
	}
});

test('Esprima Comparison', function() {

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
	]).map(esprima_comparison_test);
});

test('Ternary', function() {
	var val = jsep('a ? b : c');
	equal(val.type, 'ConditionalExpression');
	val = jsep('a||b ? c : d');
	equal(val.type, 'ConditionalExpression');
});

test('Named Arguments', function() {
	var val = jsep('named(arg1="hi", arg2="bye")');
	equal(val.type, 'CallExpression');
	equal(val.callee.type, 'Identifier');
	equal(val.callee.name, 'named');
	equal(val.arguments[0].type, 'KeyValueExpression');
	equal(val.arguments[0].keys.arg1.type, 'Literal');
	equal(val.arguments[0].keys.arg1.raw, '"hi"');
	equal(val.arguments[0].keys.arg1.value, 'hi');
	equal(val.arguments[0].keys.arg2.type, 'Literal');
	equal(val.arguments[0].keys.arg2.raw, '"bye"');
	equal(val.arguments[0].keys.arg2.value, 'bye');

	var val = jsep('named(arg1="hi" arg2="bye")');
	equal(val.type, 'CallExpression');
	equal(val.callee.type, 'Identifier');
	equal(val.callee.name, 'named');
	equal(val.arguments[0].type, 'KeyValueExpression');
	equal(val.arguments[0].keys.arg1.type, 'Literal');
	equal(val.arguments[0].keys.arg1.raw, '"hi"');
	equal(val.arguments[0].keys.arg1.value, 'hi');
	equal(val.arguments[0].keys.arg2.type, 'Literal');
	equal(val.arguments[0].keys.arg2.raw, '"bye"');
	equal(val.arguments[0].keys.arg2.value, 'bye');
});

test('Key-Value Expressions', function() {
	var val = jsep('named[arg1="hi", arg2="bye"]');
	equal(val.type, 'MemberExpression')
	equal(val.computed, true)
	equal(val.object.name, 'named')
	equal(val.property.type, 'KeyValueExpression')
	equal(val.property.keys.arg1.type, 'Literal');
	equal(val.property.keys.arg1.raw, '"hi"');
	equal(val.property.keys.arg1.value, 'hi');
	equal(val.property.keys.arg2.type, 'Literal');
	equal(val.property.keys.arg2.raw, '"bye"');
	equal(val.property.keys.arg2.value, 'bye');

	val = jsep('named[arg1="hi" arg2="bye" , arg3=4]');
	equal(val.type, 'MemberExpression')
	equal(val.computed, true)
	equal(val.object.name, 'named')
	equal(val.property.type, 'KeyValueExpression')
	equal(val.property.keys.arg1.type, 'Literal');
	equal(val.property.keys.arg1.raw, '"hi"');
	equal(val.property.keys.arg1.value, 'hi');
	equal(val.property.keys.arg2.type, 'Literal');
	equal(val.property.keys.arg2.raw, '"bye"');
	equal(val.property.keys.arg2.value, 'bye');
	equal(val.property.keys.arg3.type, 'Literal');
	equal(val.property.keys.arg3.raw, '4');
	equal(val.property.keys.arg3.value, 4);
});

}());
