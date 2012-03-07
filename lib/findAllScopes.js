define(["build/buildControl", "bdParse", "./symbols"], function(bc, bdParse, symbols){
	// TODO: remove after dev
	bc.bdDoc = bc.bdDoc || {};
	bc.bdDoc.dojoConsumeParamTypes = 1;

	var
		currentResource,
		sumLocations= bdParse.sumLocations,
		tName= bdParse.symbols["tName"];

	function traverse(node, sause){
		node && node.traverse && node.traverse(sause);
	}

	function processCommentBlock(block){
		var commonWhitespace, minLength= Number.MAX_VALUE;
		block = block.map(function(comment){
			// peel off the comment delimiters
			var text;
			if(comment.type===tLineComment){
				text = comment.value.substring(2);
			}else{
				text = comment.value.replace(/^\/\*/, "").replace(/\*\/$/, "");
			}

			if(/^\s*$/.test(text)){
				// ignore empty lines
				text = "";
			}else if(minLength){
				// compute the maximum common whitespace prefix
				var match = text.match(/^(\s+)\S/);
				match = match && match[1];
				if(!match){
					// no whitespace for this line; therefore cann't take any off of any lines
					minLength = 0;
				}else if(minLength==Number.MAX_VALUE){
					// first time through
					commonWhitespace = match.substring(0);
					minLength = commonWhitespace.length;
				}else if(match.substring(0, minLength)==commonWhitespace){
					// short curcuit
				}else{
					// recompute a new, smaller commonWhitespace value
					for(var i = 0, end = Math.min(minLength, match.length); i<end; i++){
						if(commonWhitespace.charAt(i)!=match.charAt(i)){
							minLength = i;
							commonWhitespace = commonWhitespace.substring(0, minLength);
							break;
						}
					}
				}
			}
			return text;
		});

		// remove the maximum common whitespace prefix (if any)
		if(minLength){
			block = block.map(function(line){ return (line && line.substring(minLength)) || line; });
		}

		// a vector of strings ready for processing
		return block;
	}

	function parseDocComment(comment){
		// aggregate all doc blocks into a single vector of strings
		for(var block, current, result = [], i = 0, end = comment.length; i<end;){
			block = [(current = comment[i++])];
			while(i<end && current.location.endLine+1 >= comment[i].location.startLine){
				block.push((current = comment[i++]));
			}
			result = result.concat(processCommentBlock(block));
		}
		return result;
	}

	var tLineComment= bdParse.symbols["tLineComment"],
		tBlockComment= bdParse.symbols["tBlockComment"],
		tPunc= bdParse.symbols["tPunc"];
	function ParseDojoParamListTokens(
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
		if(bc.bdDoc.dojoConsumeParamTypes && node.leftParenToken.comment && node.leftParenToken.comment[0].type==tBlockComment){
			var start = node.leftParenToken.location, end = node.rightParenToken.location, text;
			if(start.startLine==end.endLine){
				text = currentResource.text[start.startLine].substring(start.startCol+1, end.endCol-1);
			}else{
				text = currentResource.text[start.startLine].substring(start.startCol+1);
				for(var i = start.startLine + 1; i<end.endLine; i++){
					text+= "\n" + currentResource.text[i];
				}
				text += currentResource.text[end.endLine].substring(0, end.endCol-1);
			}

			// tokenize, pop off the eof token
			var tokens = bdParse.tokenize(bdParse.split(text));
			tokens.pop();

			// parse the param list...hate to do it this way, but the parsing is so trival that it's more bother to run it through the real parser
			var params = ParseDojoParamListTokens(tokens);

			if(params===0){
				// total failure; probably wasn't a dojo parameter list doc comment
			}else if(params===-1){
				// partial failure; maybe the doc comment was bad
				console.log("WARNING: bad parameter list doc comment: " + currentResource.src + "(" + start.startLine + ")");
				console.log(text);
			}else{
				params = params.map(function(param){ return param.location.offsetLine(start.startLine); });
				node.parameterList = params;
				params.parent = node;
			}
		}
	}

	var sause = {
		beforeLexicalVariable:function(sause){
			symbols.insSymbol(this.name.value, this.name.location);
		},

		beforeForIn:function(sause){
			if(this.varToken){
				symbols.insSymbol(this.varNameToken.value, this.varNameToken.location);
			}
		},

		beforeFunctionLiteral:function(){
			processFunctionParamList(this);
			symbols.pushFrame(this);
			if(this.nameToken){
				symbols.insSymbol(this.nameToken.value, this.nameToken.location);
			}
			this.parameterList.forEach(function(item){
				symbols.insSymbol(item.value, item.location);
			});
			if(this.body.leftBraceToken.comment){
				this.doc = parseDocComment(this.body.leftBraceToken.comment);
			}
		},

		afterFunctionLiteral:function(){
			symbols.popFrame(this);
		},

		beforeFunctionDef:function(){
			processFunctionParamList(this);
			symbols.insSymbol(this.nameToken.value, this.nameToken.location);
			symbols.pushFrame(this);
			this.parameterList.forEach(function(item){
				symbols.insSymbol(item.value, item.location);
			});
			if(this.body.leftBraceToken.comment){
				this.doc = parseDocComment(this.body.leftBraceToken.comment);
			}
		},

		afterFunctionDef:function(){
			symbols.popFrame(this);
		},

		beforeObject:function(){
			if(this.leftBraceToken.comment){
				this.doc = parseDocComment(this.leftBraceToken.comment);
			}
			this.propertyList.forEach(function(item){
				symbols.insSymbol(item.value, item.location);
			});
		},

		binaryOp:function(sause){
			// TODO: handlewith x["this-property"]
			//
			// if this is the top of a JavaScript dotted name AST, then convert the node to a name node
			var node = this, segments = [], firstSegment, lastSegment;
			while(node.type===bdParse.BinaryOpNode && node.op.value=="."){
				if(node.lhs.type!==bdParse.NameNode){
					traverse(node.lhs, sause);
					traverse(node.rhs, sause);
					return;
				}
				if(!firstSegment){
					firstSegment = node.lhs;
					segments = [node.lhs.token.value];
				}else{
					segments.push(node.lhs.token.value);
				}
				node = node.rhs;
			}
			if(node.type!==bdParse.NameNode){
				traverse(node, sause);
				return;
			}

			// this was a JavaScript dotted name; replace the node
			lastSegment = node;
			segments.push(lastSegment.token.value);
			var nameNode = new bdParse.NameNode(new bdParse.token(tName, segments.join("."), sumLocations(firstSegment.token.location, lastSegment.token.location)));
			nameNode.srcTree = this;
			if(lastSegment.comment){
				nameNode.comment = (firstSegment.comment || []).concat(lastSegment.comment);
			}else if(firstSegment.comment){
				nameNode.comment = firstSegment.comment;
			}
			bdParse.replaceNode(this, nameNode);
		}
	};

	return function(resource) {
		console.log(resource.src);
		currentResource = resource;
		//try {
			if(resource.ast){
				symbols.insSymbol(resource.mid, 0);
				resource.ast.traverse(sause);
			}
			//debug(symbols.globalFrame, 10, 1);
		//} catch (e) {
		//	return "failed during AMD preprocessing: " + e.message;
		//}
		return 0;
	};

});
