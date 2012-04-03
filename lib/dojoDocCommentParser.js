define(["build/buildControl", "bdParse", "./symbols", "./utils"], function(bc, bdParse, symbols, utils){
	// kinds of blocks:
	// description
	// returns
	// example
	// tags
	//
		// summary: Simple summary
		// description:
		//		Simple Description.
		//		On Multiple lines.
		// id: String?
		//		Duplicate matched in signature and in line
		// returns: String
		//		Whatever

	function check(text){
		for(var i = 0; i<text.length; i++){
			if(text[i].match(/\s+[^:]+\:/)){
				console.log(text[i]);
				console.log("error1: "  + utils.locationText(node));
			}
		}
	}

	function parseBlock(doc, node){
		// parses doc (an array of strings) into an array of triples of
		//   [keyword, optional-rest-of-keyword-line, array of strings]
		// that give that values of each of the sections of the doc block. This routine
		// modifies doc directly and sets the property doc.parsed to indicate that
		// doc has been parsed. This allows parseBlock to be called multiple times
		// on the same doc block without harm


		//check();

		if(!doc || doc.parsed){
			return;
		}

		var result = [], i = 0, end = doc.length, line, rest, summarySeen;
		function consumeSection(){
			rest = [];
			while(i<end && !/([^:]+)\:/.test(doc[i])){
				rest.push(doc[i++]);
			}
			return rest;
		}

		while(i<end){
			line = doc[i++];
			if(line.length==0){
				// ignore
			}else{
				// should be of the form
				// <word>:[<stuff>]
				var match = line.match(/([^:\s]+)\:\w*(.*)/);
				if(match){
					result.push([match[1], match[2], consumeSection()]);
					summarySeen = summarySeen || match[1]=="summary";
				}else{
					//console.log("WARNING: doc block without a doc metacommand: " + utils.locationText(node));
				}
			}
		}
		if(result.length && !summarySeen){
			//console.log("WARNING: doc block without a summary metacommand: " + utils.locationText(node));
			//console.log(doc);
		}

		doc.splice(0, doc.length);
		result.forEach(function(item){doc.push(item);});
		doc.parsed = true;
	}

	function moveChildItems(node, children){
		// node is one of {ObjectNode, FunctionDefNode, FunctionLiteralNode}. Parse node's doc block (if any); if the doc block includes
		// property/param docs, move those down to the property/param nodes warn and ignore attempts to doc the same property with
		// multiple doc blocks (i.e., one at the object, the other at the property).
		var doc = node.doc;
		if(doc){
			parseBlock(doc, node);
			for(var child, item, i = 0; i<doc.length; i++){
				item = doc[i];
				child = children[item[0]];
				if(child){
					if(child.doc){
						console.log("WARNING: item (" + item[0] + ") documented in multiple places: " + utils.locationText(child));
					}else{
						child.doc = item;
						item.ref = child;
						doc.slice(i, 1);
						i--;
					}
				}
			}

		}
	}

	function parseObject(node){
		///
		// node is a ObjectNode

		// parse all the property doc blocks (if any); make a map from property name to property node for use with moveChildItems
		var	props = {};
		node.propertyList.forEach(function(item){
			parseBlock(item.doc);
			props[item.nameToken.value] = item;
		});
		// remember the properties as a set which is easier to process is some cases
		node.props = props;
		moveChildItems(node, props);
	}

	function parseFunction(node){
		///
		// node is either a FunctionDefNode or a FunctionLiteralNode

		// parse all the param doc blocks (if any); make a map from param name to param node for use with moveChildItems
		var params = {};
		node.parameterList.forEach(function(item){
			params[item.value] = item;
			if(item.commaToken && item.commaToken.doc){
				if(item.doc){
					console.log("WARNING: multiple docs found at " + utils.locationText(item));
				}else{
					item.doc = item.commaTocken.doc;
					item.doc.ref = item;
				}
			}
			parseBlock(item.doc);
		});
		moveChildItems(node, params);
	}

	return {
		parseObject:parseObject,
		parseFunction:parseFunction
	};
});
