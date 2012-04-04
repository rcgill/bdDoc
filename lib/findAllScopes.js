define(["build/buildControl", "bdParse", "./symbols", "require"], function(bc, bdParse, symbols, require){
	var
		currentResource,
		sumLocations= bdParse.sumLocations,
		tName= bdParse.symbols["tName"];

	var docBlockParsers = 0;
	function getDocBlockParsers(){
		if(!docBlockParsers){
			require(bc.docBlockParsers, function(){
				docBlockParsers = [];
				for(var i = 0; i<arguments.length; i++){
					docBlockParsers.push(arguments[i]);
				}
			});
		}
	}

	function moveComment(dest, src){
		if(src && src.comment){
			if(dest.comment){
				//TODO signal error
				//multiple items
				return;
			}else{
				dest.comment = src.comment;
				delete src.comment;
			}
		}
	}

	function parseDocComment(
		src // (object) An object that contains a potential doc comment
	){
		///
		//  If src.comment is a proper docComment, then parses src.comment into a docBlock as stores result src.doc; otherwise, no-op.

		if(src.comment && src.comment.length){
			docBlockParsers.some(function(item){return item.parse(src);});
		}
	}

	var sause = {
		afterVar:function(sause){
			// optionally push a comment attached to a var token
			var firstVar = this.varList[0];
			if(this.varToken.comment && !firstVar.doc){
				moveComment(firstVar, this.varToken);
				parseDocComment(firstVar);
			}
		},

		beforeLexicalVariable:function(sause){
			moveComment(this.nameToken, this.assignToken);
			moveComment(this, this.nameToken);
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
			// notice the frame is pushed *before* the name (if any); this is the key difference between a function literal and a function def
			this.frame = symbols.pushFrame(this);
			if(this.nameToken){
				this.symbol = symbols.insSymbol(this.nameToken.value, this.nameToken.location).setterLocs.push(this);
			}
			this.parameterList.forEach(function(item){
				symbols.insSymbol(item.value, item.location);
			});
			moveComment(this, this.body.leftBraceToken);
			parseDocComment(this);
		},

		afterFunctionLiteral:function(){
			symbols.popFrame(this);
		},

		beforeFunctionDef:function(){
			// notice the frame is pushed *after* the name (if any); this is the key difference between a function literal and a function def
			this.symbol = symbols.insSymbol(this.nameToken.value, this.nameToken.location).setterLocs.push(this);
			this.frame = symbols.pushFrame(this);
			this.parameterList.forEach(function(item){
				symbols.insSymbol(item.value, item.location);
			});
			moveComment(this, this.body.leftBraceToken);
			parseDocComment(this);
		},

		afterFunctionDef:function(){
			symbols.popFrame(this);
		},

		beforeObject:function(){
			moveComment(this, this.leftBraceToken);
			parseDocComment(this);
		},

		afterProperty:function(){
			moveComment(this.nameToken, this.colonToken);
			moveComment(this, this.nameToken);
			parseDocComment(this);
		},

		afterObject:function(){
			var props = this.props = {};
			this.propertyList.forEach(function(item){
				props[item.nameToken.value] = item;
			});
		},

		afterBinaryOp:function(sause){
			switch(this.opToken.value){
				case ".":
					var lhs = this.lhs, rhs = this.rhs;
					if(lhs.type===bdParse.NameNode && rhs.type===bdParse.NameNode){
						var nameNode = new bdParse.NameNode(new bdParse.token(tName, lhs.token.value + "." + rhs.token.value, sumLocations(lhs.token.location, rhs.token.location)));
						bdParse.replaceNode(this, nameNode);
					}
					break;

				case "=":
					moveComment(this.lhs, this.opToken);
					moveComment(this, this.lhs);
					parseDocComment(this);
					break;

				default:
			}
		}
	};

	return function(resource) {
		getDocBlockParsers();

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
