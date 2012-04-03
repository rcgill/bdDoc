define(["build/fileUtils", "bdParse", "./symbols"], function(fileUtils, bdParse, symbols) {
	var
		// the resource currently being processed
		currentResource;

	function propagatePropsToSymbol(symbol, props){
		var prop, p;
		for(p in props){
			prop = props[p];
			if(prop.doc){
				if(symbol[p] && symbol[p].doc){
					// TODO duplicate
				}else{
					(symbol.props[p] || (symbol.props[p] = new symbols.getSymbol(p))).doc = prop.doc;
				}
			}
		}
	}


	var docProcessorsInstalled = 0;
	function installDocProcessors(){
		if(docProcessorsInstalled){
			return;
		}
		docProcessorsInstalled = 1;

		var getSymbol = function(module, name){
			if(module){
				var s =symbols.getSymbol(module, symbols.globalFrame);
				if(!s){
					s = symbols.insSymbolWithFrame(module, symbols.globalFrame);
				}
				name = module + "." + name;
			}
			return symbols.getSymbol(name, symbols.globalFrame) || symbols.insSymbol(name, symbols.globalFrame);
		};

		var standardDeps = ["require", "exports", "module"];

		getSymbol(0, "define").traverse = function(sause, traverse){
			///
			// Process a global define application.
			//
			// Factory return value is published to module value; any writes to dependent modules (usually properties)
			// are published to dependent modules.
			//

			// decode mid, deps, factory
			var mid, deps, factory, args = this.argList;
			if(args.length==3){
				mid = args[0];
				deps = args[1];
				factory = args[2];
			}else if(args.length==2){
				if(args[0].type==bdParse.ArrayNode){
					// signature is (deps, factory)
					deps = args[0];
					factory = args[1];
				}else{
					// signature is (mid, factory)
					mid = args[0];
					deps = standardDeps;
					factory = args[1];
				}
			}else{
				deps = standardDeps;
				factory = args[0];
			}

			if(mid){
				console.log("ignoring absolute module identifer in AMD define application");
			}

			// decode deps into a vector of absolute module ids (strings)
			if(deps!==standardDeps){
				if(deps.type!==bdParse.ArrayNode){
					console.log("hmmm, deps should be an array");
					return;
				}else{
					var error = false;
					deps = deps.exprList.map(function(item){
						if(item.type===bdParse.StringNode){
							mid = item.token.value;
							return mid.charAt(0)=="." ?  fileUtils.compactPath(currentResource.mid + "/../" + mid) : mid;
						}else{
							console.log("hmmm, deps item is not a constant string");
							error = true;
							return 0;
						}
					});
					if(error){
						return;
					}
				}
			}

			// find the docs for the factory
			var doc = 0;
			if(factory.type===bdParse.FunctionLiteralNode){
				// factory is a function; set the parameters on the frame to reference the modules given in deps
				var params = factory.parameterList;
				if(params.length>deps.length){
					console.log("hmmm, more parameters to factory than deps");
				}else{
					for(var m, i = 0; i<params.length; i++){
						m = symbols.getSymbol(deps[i], symbols.globalFrame);
						factory.frame.symbols[params[i].value] = m;
					}
				}


				traverse.call(this, sause);

				// find docs for the module
				factory.returns.forEach(function(returnExpr){
					if(returnExpr.doc){
						if(doc){
							console.log("hmmm, multiple docs for single factory");
						}else{
							doc = returnExpr.doc;
						}
					}
				});
			}else{
				doc = factory.doc;
			}

			if(doc){
				symbols.globalFrame.symbols[currentResource.mid].doc = doc;
			}
		};

		getSymbol("dojo/_base/lang", "extend").traverse = function(sause, traverse){
			traverse.call(this, sause);
			var args = this.argList,
				ctor = args[0],
				extensionObject = args[1],
				props = extensionObject.props,
				ref, members, p;
// TODO: what is extensionObject is a symbol?
			if(ctor.doc){
				// the function argument to dojo.extend is some kind of function expression
				ref = ctor.doc.ref;
			}else if(ctor.type===bdParse.NameNode){
				// the function argument to dojo.extend is a name
				var s = symbols.getSymbol(ctor.token.value, currentFrame);
				if(s.doc){
					ref = s.doc.ref;
				}
			}
			if(ref){
				if(!ref.members){
					ref.members = {};
				}
				members = ref.members;
				for(p in props){
					if(props[p].doc){
						members[p] = props[p].doc;
					}
				}
			} else {
				for(p in props){
					if(props[p].doc){
						// TODO warn...docs for a members property but not the ctor
						// one warning is enough
						return;
					}
				}
				return;
			}
		};


		getSymbol("dojo/_base/declare").traverse = function(sause, traverse){
			//TODO
		},

		getSymbol("dojo/_base/lang", "mixin").traverse = function(sause, traverse){
			//TODO
		},

		getSymbol("dojo/_base/kernel").traverse = function(sause, traverse){
		};
	}

	var currentFrame, frameStack = [symbols.globalFrame];

	var sause = {
		beforeFunctionLiteral:function(){
			frameStack.push(currentFrame = this.frame);
			this.returns = [];
		},

		afterFunctionLiteral:function(){
			currentFrame = frameStack.pop();
		},

		beforeFunctionDef:function(){
			frameStack.push(currentFrame = this.frame);
			this.returns = [];
		},

		afterFunctionDef:function(){
			currentFrame = frameStack.pop();
		},

		Application:function(sause, traverse){
			if(this.funcExpr.type===bdParse.NameNode){
				var s = symbols.getSymbol(this.funcExpr.token.value, currentFrame);
				if(s.traverse){
					s.traverse.call(this, sause, traverse);
					return;
				}
			}
			traverse.call(this, sause);
		},

		afterReturn:function(){
			if(this.expr.type===bdParse.NameNode){
				this.doc = symbols.getSymbol(this.expr.token.value, currentFrame);
			}else{
				if(this.expr.doc){
					this.doc = this.expr;
				}
			}
			var p = this.parent;
			while(p && p.type!==bdParse.FunctionLiteralNode  && p.type!==bdParse.FunctionDefNode){
				p = p.parent;
			}
			if(p){
				p.returns.push(this);
			}else{
				console.log("hmmm, return not in a function");
			}
		},

		afterBinaryOp:function(sause){
			switch(this.opToken.value){
				case "=":
					if(this.rhs.doc){
						this.doc = this.rhs.doc;
						if(this.lhs.doc){
							console.log("hmmm, assigning docs that are already assigned");
						}else if(this.lhs.type===bdParse.NameNode){
							// assigning a name
							var s = symbols.getSymbol(this.lhs.token.value, currentFrame);
							s.doc = this.rhs.doc;
							s.setterLocs.push(this);
							if(this.rhs.type===bdParse.ObjectNode){
								propagatePropsToSymbol(s, this.rhs.props);
							}
						}
					}
					break;
			}
		},

		afterLexicalVariable:function(sause){
			if(this.initialValue && this.initialValue.doc){
				if(this.doc){
					//TODO: warn, duplicate
				}else{
					this.doc = this.initialValue.doc;
				}
			}
			var s = symbols.getSymbol(this.nameToken.value, currentFrame);
			if(this.doc){
				s.doc = this.doc;
			}
			if(this.initialValue && this.initialValue.type===bdParse.ObjectNode){
				propagatePropsToSymbol(s, this.initialValue.props);
			}
		}
	};

	return function(resource) {
		installDocProcessors();

		currentResource = resource;
		//try {
			if(resource.ast){
				resource.ast.traverse(sause);
			}
			console.log(resource.src);
			//debug(resource.symbol, 3, 1);
			debug(symbols.dumpSymbol(resource.symbol), 10, 1);
			//debug(symbols.globalFrame, 10, 1);
		//} catch (e) {
		//	return "failed during AMD preprocessing: " + e.message;
		//}
		return 0;
	};

});
