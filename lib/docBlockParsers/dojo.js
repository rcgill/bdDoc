define(["bdParse", "dojo/_base/lang"], function(bdParse, lang){
	var tLineComment = bdParse.symbols["tLineComment"],
		tBlockComment = bdParse.symbols["tBlockComment"],
		tPunc= bdParse.symbols["tPunc"],
		tName= bdParse.symbols["tName"],
		keywordRegex = /^(\s+)(\S+)\:(.*)$/,
		codeRegEx = /^\s*\|(.*)/;

	function getResource(
		node //(bdParse.asn)
	){
		while(node && !node.resource){
			node = node.parent;
		}
		return node && node.resource;
	}

	function ParseParamList(
		tokens //(array of tokens) tokens to filter
	) {
		// try to parse a paremeter list IAW the dojo parameter list doc comment
		// if successful, return the token vector of names decorated with associated types
		// if doesn't look at all like a dojo parameter list doc comment, then return 0
		// if starts out looking like a dojo parametet list doc comment and then fails, return -1
		var filtered= [], item, i = 0, end = tokens.length;
		function errorReturnValue(){
			return filtered.length || filtered.varArgs ? -1 : 0;
		}
		while(i<end){
			item = tokens[i++];
			if(item.type==tBlockComment){
				var dojoType = item.value.substring(2, item.value.length-2).trim();
				if(/^,/.test(dojoType)){
					dojoType = dojoType.substring(1).trim();
				}
				if(/\.\.\.$/.test(dojoType)){
					filtered.varArgs = true;
				}
				if(i<end){
					item = tokens[i++];
					if(item.type===tName){
						// a good dojoType
						item.dojoType = dojoType;
						filtered.push(item);
					}else{
						// hmmm, two comments?...whatever, not a valid dojo doc comment for a param list
						return errorReturnValue();
					}
				}else if(/\.\.\.$/.test(dojoType)){
					// a good dojoType; no parameter needed with the last "..."
				}else{
					// no parameter to match it against
					return errorReturnValue();
				}
			}else if(item.type==tName){
				filtered.push(item);
			}else{
				// hmmm, tLineComment?...whatever, not a valid dojo doc comment for a param list
				return errorReturnValue();
			}
			var peek = i<end && tokens[i];
			if (peek && peek.type===tPunc && peek.value==",") {
				i++;
			}
		}
		return filtered;
	}

	function processFunctionParamList(node){
		if(node.leftParenToken.comment && node.leftParenToken.comment[0].type==tBlockComment){
			var resource = getResource(node),
				start = node.leftParenToken.location, end = node.rightParenToken.location, text;
			if(start.startLine==end.endLine){
				text = resource.text[start.startLine].substring(start.startCol+1, end.endCol-1);
			}else{
				text = resource.text[start.startLine].substring(start.startCol+1);
				for(var i = start.startLine + 1; i<end.endLine; i++){
					text+= "\n" + resource.text[i];
				}
				text += resource.text[end.endLine].substring(0, end.endCol-1);
			}

			// tokenize, pop off the eof token
			var tokens = bdParse.tokenize(bdParse.split(text));
			tokens.pop();

			// parse the param list...hate to do it this way, but the parsing is so trival that it's more bother to run it through the real parser
			var params = ParseParamList(tokens);

			if(params===0){
				// total failure; probably wasn't a dojo parameter list doc comment
			}else if(params===-1){
				// partial failure; maybe the doc comment was bad
				//console.log("WARNING: bad parameter list doc comment: " + resource.src + "(" + start.startLine + ")");
				//console.log(text);
			}else{
				params.forEach(function(param){
					param.parent = node;
					param.location.offsetLine(start.startLine);
				});
				node.parameterList = params;
				params.parent = node;
			}
		}
	}

	function DocBlock(node){
		this.ref = node;
		this.summary = [];
		this.description = [];
		this.examples = [];
	}
	lang.extend(DocBlock, {
		isDojoDocBlock:true,

		pushExample:function(){
			var result = [];
			this.examples.push(result);
			return result;
		},

		pushTag:function(name, type){
			var tags = this.tags || (this.tags = {});
			return tags[name] = type ? [type] : [];
		},

		pushReturn:function(text){
			(this.returns || (this.returns = [])).push(text);
		},

		pushProp:function(){
			var result = [];
			(this.props || (this.props = [])).push(result);
			return result;
		},

		debug:function(){
			console.log("\n\n");
			console.log(this.ref.location);
			this.summary.length && console.log("summary", this.summary);
			this.description.length && console.log("description", this.description);
			this.examples.length && console.log("examples", this.examples);
			this.params && console.log("params", this.params);
			this.returns && console.log("returns", this.returns);
			this.tags && console.log("tags", this.tags);
		}
	});

	function Code(text){
		this.value = text;
	}

	function parse(node){
		// a single tLineComment following a return statement in a function that has a dojo doc block is likely a dojo doc block
		if(node.type===bdParse.ReturnNode){
			if(node.comment.length==1 && node.comment.type===tLineComment && node.parent.doc && node.parent.doc.isDojoDocBlock){
				var returnType = node.comment.value.substring(2).trim();
				if(returnType.length){
					node.parent.doc.returns.push(returnType);
				}
				return true;
			}
			if(node.comment.length==1 && node.comment.type===tBlockComment && node.parent.doc && node.parent.doc.isDojoDocBlock){
				// a block comment that looks like a return comment block
				console.log("hmmm, could this be a dojo return type?", node.location);
			}
			return false;
		}
		// a dojo comment block is a sequence of only tLineComments
		if(node.comment.some(function(item){return item.type!==tLineComment;})){
			return false;
		}

		// text is the block with the "//" comment delimiter stripped and right-trimmed
		var text = node.comment.map(function(item){return item.value.substring(2).replace(/\s+$/, "");});

		// Now comes the hard part of finding keyword -> block. Ideally all keywords should
		// be in the same column and all doc blocks associated with a keyword should be more indented identically and more
		//  than the keyword.
		// Unfortunately, this isn't the case. Notice that the docs in dojo/base/array have parameters indented different
		// than other keywords. Also notice that some code blocks are indented the same as the example keyword. Lastly, some
		// of these anomolies are hard to detect visually because of dojo's use of tabs.
		//
		// The algorithm below assumes a doc block is a sequence of (keyword, block)s; failing this assuming indicates the
		// doc block is not detected to be a dojo doc block.
		//
		// Any line that starts with /\s*\|/ is a code line, irrespective of indenture.
		//
		// Otherwise, the first line after a keyword gives the indenture expected for the whole block associated with that
		// keyword. Further this line must be indented at least one additional character compared to the keyword, otherwise
		// it is interpretted as another keyword line. This algorithm correctly discovers all intended legal cases and most
		// defective cases. A  warning is given if the doc block contains at least one keyword yet fails to parse.


		var result = new DocBlock(node),
			i = 0, end = text.length,
			foundKeyword = 0,
			dest;
		while(i<end){
			var match = text[i].match(keywordRegex);
			if(!match){
				break;
			}
			i++;
			foundKeyword = true;
			switch(match[2]){
				case "summary":
					dest = result.summary;
					break;
				case "description":
					dest = result.description;
					break;
				case "example":
					dest = result.pushExample();
					break;
				default:
					// either a tag or a parameter; we'll figure it out at the end of this routine
					dest = result.pushTag(match[2], match[3]);
					break;
			}

			if(i<end){
				// consume lines associated with the current keyword
				// with the exception of code lines, every line in this block must be indented by at least one more than the keyword
				var minLeadingSpaces = match[1].length + 1,
					maxCommonLeadingSpaces = Number.MAX_VALUE, l, chunk;
				while(i<end){
					chunk = "";
					while(i<end && (match = text[i].match(codeRegEx))){
						chunk += match[1] + "\n";
						i++;
					}
					if(chunk){
						dest.push(new Code(chunk));
					}
					chunk = [];
					while(i<end){
						l = text[i];
						if(!l){
							// a blank line
							chunk.push(l);
						}else if(/\S/.test(l.substring(0, minLeadingSpaces))){
							// a non-white-space found in the required indenture region
							break;
						}else{
							// add to current chunk, continue computing the max number of whitespace all lines have
							chunk.push(l);
							maxCommonLeadingSpaces = Math.min(maxCommonLeadingSpaces, l.match(/^(\s+)/)[1].length);
						}
						i++;
					}
					// push the chunk after left-trimming the common whitespace and joining with newlines
					dest.push(chunk.map(function(l){return l.substring(maxCommonLeadingSpaces);}).join("\n"));
					if(i<end && !codeRegEx.test(text[i])){
						// required indenture failed AND not a code line; therefore that's all for this keyword
						break;
					}
				}
			}
		}
		if(i<end){
			if(foundKeyword){
				// found some, but then an error
				console.log("hmmm, a comment started to look like a dojo doc comment block, but then failed to parse.", node.comment[0].location);
			}
			return false;
		}
		node.doc = result;
		if(node.type==bdParse.FunctionLiteralNode || node.type==bdParse.FunctionDefNode){
			// sniff out the parameter types
			processFunctionParamList(node);

			// create the parameter list; move any parameter docs that may have been stuffed in the tag list to the parameter list
			var params = result.params = [];
			node.parameterList.forEach(function(item){
				// item is a token with type===tName
				var paramName = item.value,
					param = [];
				if(result.tags && result.tags[paramName]){
					param = result.tags[paramName];
					delete result.tags[paramName];
				}

				if(item.dojoType){
					param.unshift(item.dojoType);
				}
				param.unshift(paramName);
				params.push(param);
			});
		}
result.debug();
		return true;
	}

	return {
		DocBlock:DocBlock,
		Code:Code,
		parse:parse
	};
});



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
