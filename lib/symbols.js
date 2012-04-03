define(["bdParse/asn"], function(asn) {
	var cFrame;

	var id = 1;

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
		this.node = node;
		this.parent = parent;
		this.children = [];
		this.symbols = {};
		this.id = id++;
	}

	function getSymbol(name, frame){
		var result, target, match;
		frame = frame || cFrame;
		result, target, match = name.match(/^([^\.]+)\.(.+)$/);
		if(match){
			target = match[1];
			name = match[2];
		}else{
			target = name;
		}
		while(frame){
			result = frame.symbols[target];
			if(result){
				return match ?
					(result.props[name] || (result.props[name] = new Symbol(name))) :
					result;
			}
			frame = frame.parent;
		}
		return 0;
	}

	function cleanup(doc){
		return {
			docs: doc && doc.map(function(item){ return [item[0], item[1], item[2].join("\n")]; }),
			locations: doc && doc.ref.location
		};
	}

	function dumpSymbol(s){
		while(s.doc instanceof Symbol){
			s = s.doc;
		}
		var result = {name:s.name, doc:cleanup(s.doc) || 0, props:{}},
			prototype, p, set, dest;
		set = s.props;
		dest = result.props;
		for(p in set){
			dest[p] = dumpSymbol(set[p]);
		}
		if((set = s.doc && s.doc.ref.members)){
			dest = result.members = {};
			for(p in set){
				dest[p] = cleanup(set[p]);
			}
		}
		return result;
	}

	function dumpModules(){
		var result = {};
		for(var p in globalFrame){
			var s = globalFrame[p];
			if(s.module){
				result[s.module.mid] = dumpSymbol(s);
			}
		}
		return result;
	}

	var globalFrame = cFrame = new Frame("global", 0);

	return {
		globalFrame:globalFrame,

		pushFrame:function(node){
			var result = new Frame(node, cFrame);
			cFrame.children.push(result);
			return (cFrame = result);
		},

		popFrame:function(){
			cFrame = cFrame.parent;
		},

		insSymbol:function(name, location, value){
			return cFrame.symbols[name] = new Symbol(name, location);
		},

		insSymbolWithFrame:function(name, frame, location, value){
			return frame.symbols[name] = new Symbol(name, location);
		},

		getSymbol:function(name, frame){
			var result = getSymbol(name, frame);
//			console.log("getSymbol:" + name, result);
			return result;
		},

		dumpSymbol:dumpSymbol
	};
});
