define(["bdParse/asn"], function(asn) {
	var cFrame;

	function Symbol(name, location){
		this.name = name;
		this.location = location;
		this.declaredLoc = 0;
		this.setterLocs = [];
		this.getterLocs = [];
		this.doc = 0;
		this.props = {};
	}

	function Frame(node, parent){
		this.node = 0;//node;
		this.parent = parent;
		this.children = [];
		this.symbols = {};
	}

	return {
		globalFrame:(cFrame = new Frame("global", 0)),

		pushFrame:function(node){
			var result = new Frame(node, cFrame);
			cFrame.children.push(result);
			cFrame = result;
		},

		popFrame:function(){
			cFrame = cFrame.parent;
		},

		insSymbol:function(name, location){
			cFrame.symbols[name] = new Symbol(name, location);
		},

		getSymbol:function(name, frame){
			frame = frame || cFrame;

			var result, target, match = name.match(/^([^\.])+\..+$/);
			if(match){
				target = match[1];
			}else{
				target = name;
			}
			while(frame){
				result = frame.symbols[target];
				if(result){
					if(match){
						if(result.props[name]){
							return result.props[name];
						}else{
							return (result.props[name] = new Symbol(name));
						}
					}else{
						return result;
					}
				}
				frame = frame.parent;
			}
			return 0;
		},

		resolveName:function(node){
			// node is one of an asnName, a tree of asnBinaryOp's of "." operators, or something else
			// if something else, return 0; otherwise, return the dotted javascript name
			if(node.type===asn.NameNode){
				return node.children.value;
			}else if(node.type===asn.BinaryOpNode && node.op.value=="."){
				var lhs = resolveName(node.lhs),
				rhs = resolveName(node.rhs);
				return lhs && rhs && (lhs + "." + rhs);
			}else{
				return 0;
			}
		}
	};
});
