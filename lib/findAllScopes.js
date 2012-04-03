define(["build/buildControl", "bdParse", "./symbols", "./dojoDocCommentParser"], function(bc, bdParse, symbols, dojoDcp){
	// TODO: remove after dev
	bc.bdDoc = bc.bdDoc || {};
	bc.bdDoc.dojoConsumeParamTypes = 1;

	var
		currentResource,
		sumLocations= bdParse.sumLocations,
		tName= bdParse.symbols["tName"];

	function moveComment(src, dest){
		if(src.comment){
			if(dest.comment){
				//multiple items
				return;
			}else{
				dest.comment = src.comment;
				delete src.comment;
			}
		}
	}

	function processCommentBlock(block){
		// peel off the comment delimiters; split multi-line comments
		if(block[0].type===tBlockComment){
			block = block[0].value.replace(/^\/\*/, "").replace(/\*\/$/, "").split('\n');
		}else{
			block = block.map(function(comment){return comment.value.substring(2);});
		}

		var commonWhitespace, minLength= Number.MAX_VALUE;
		block = block.map(function(text){
			// expand tabs that are only preceeded by zero or more spaces with two-spaces; this allows
			// making a good guess at lines that have the same amount of whitespace at the beginning of line
			var match;
			while((match = text.match(/^( *)\t(.+)/))){
				text = match[1] + "  " + match[2];
			}

			if(/^\s*$/.test(text)){
				// normalize and ignore empty lines
				text = "";
			}else if(minLength){
				// compute the maximum common whitespace prefix
				match = text.match(/^(\s+)\S/);
				minLength = match ? Math.min(minLength, match[1].length) : 0;
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

	function parseDocComment(src){
		// aggregate all doc blocks into a single vector of strings with comment delimiters and common whitespace stripped
		if(!src.comment){
			return;
		}
		for(var block, current, comment = src.comment, result = [], i = 0, end = comment.length; i<end;){
			block = [(current = comment[i++])];
			while(i<end && current.type!==tBlockComment && current.location.endLine+1 >= comment[i].location.startLine && comment[i].type!==tBlockComment){
				block.push((current = comment[i++]));
			}
			result = result.concat(processCommentBlock(block));
		}
		result.ref = src;
		src.doc = result;
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
				//console.log("WARNING: bad parameter list doc comment: " + currentResource.src + "(" + start.startLine + ")");
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

	var sause = {
		afterVar:function(sause){
			// optionally push a comment attached to a var token iff certain conditions are fulfilled
			var firstVar = this.varList[0];
			if(this.varToken.comment && this.varList.length==1 && !firstVar.doc && !firstVar.assignToken){
				moveComment(this.varToken, firstVar);
				parseDocComment(firstVar);
			}
		},

		beforeLexicalVariable:function(sause){
			moveComment(this.assignToken, this.nameToken);
			moveComment(this.nameToken, this);
			parseDocComment(this);
			this.symbol = symbols.insSymbol(this.nameToken.value, this.nameToken.location);
		},

		beforeForIn:function(sause){
			// TODOC forIn lexical vars are not availabel to doc
			if(this.varToken){
				symbols.insSymbol(this.varNameToken.value, this.varNameToken.location);
			}
		},

		beforeFunctionLiteral:function(){
			processFunctionParamList(this);
			this.frame = symbols.pushFrame(this);
			if(this.nameToken){
				this.symbol = symbols.insSymbol(this.nameToken.value, this.nameToken.location).setterLocs.push(this);
			}
			this.parameterList.forEach(function(item){
				symbols.insSymbol(item.value, item.location);
			});
			moveComment(this.body.leftBraceToken, this);
			parseDocComment(this);
		},

		afterFunctionLiteral:function(){
			symbols.popFrame(this);
			dojoDcp.parseFunction(this);
		},

		beforeFunctionDef:function(){
			processFunctionParamList(this);
			this.symbol = symbols.insSymbol(this.nameToken.value, this.nameToken.location).setterLocs.push(this);
			this.frame = symbols.pushFrame(this);
			this.parameterList.forEach(function(item){
				symbols.insSymbol(item.value, item.location);
			});
			moveComment(this.body.leftBraceToken, this);
			parseDocComment(this);
		},

		afterFunctionDef:function(){
			symbols.popFrame(this);
			dojoDcp.parseFunction(this);
		},

		beforeObject:function(){
			moveComment(this.leftBraceToken, this);
			parseDocComment(this);
			this.propertyList.forEach(function(item){
				moveComment(item.colonToken, item.nameToken);
				moveComment(item.nameToken, item);
				parseDocComment(item);
			});
		},

		afterObject:function(){
			this.propertyList.forEach(function(item){
				if(item.initialValue.doc){
					if(item.doc){
						//console.log("WARNING: multiple doc blocks: " + currentResource.src + "(" + item.location.startLine + ")");
					}else{
						item.doc = item.initialValue.doc;
					}
				}
			});
			dojoDcp.parseObject(this);
		},

		afterBinaryOp:function(sause){
			switch(this.opToken.value){
				case ".":
					var lhs = this.lhs, rhs = this.rhs;
					if(lhs.type===bdParse.NameNode && rhs.type===bdParse.NameNode){
						var nameNode = new bdParse.NameNode(new bdParse.token(tName, lhs.token.value + "." + rhs.token.value, sumLocations(lhs.token.location, rhs.token.location)));
						bdParse.replaceNode(this, nameNode);
					}
			}
		}
	};

	return function(resource) {
		console.log(resource.src);
		currentResource = resource;
		//try {
			if(resource.ast){
				resource.symbol = symbols.insSymbol(resource.mid, 0);
				resource.symbol.resource = resource;
				resource.ast.traverse(sause);
			}
			//debug(symbols.globalFrame, 10, 1);
		//} catch (e) {
		//	return "failed during AMD preprocessing: " + e.message;
		//}
		return 0;
	};

});
