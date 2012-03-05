define(["./symbols"], function(symbols){
	var sause = {
		beforeVar:function(sause){
			this.varDefs.forEach(function(def){
				symbols.insSymbol(def.name.value, def.name.location);
			});
		},

		beforeForIn:function(sause){
			if(this.varToken){
				symbols.insSymbol(this.varNameToken.value, this.varNameToken.location);
			}
		},

		beforeFor:function(sause){
			if(this.varToken){
				this.init.forEach(function(def){
					symbols.insSymbol(def.name.value, def.name.location);
				});
			}
		},

		beforeFunctionLiteral:function(){
			symbols.pushFrame(this);
			this.parameterList.map(function(item){
				symbols.insSymbol(item.value, item.location);
			});
		},

		afterFunctionLiteral:function(){
			symbols.popFrame(this);
		},

		beforeFunctionDef:function(){
			symbols.insSymbol(this.nameToken.value, this.nameToken.location);
			symbols.pushFrame(this);
			this.parameterList.map(function(item){
				symbols.insSymbol(item.value, item.location);
			});
		},

		afterFunctionDef:function(){
			symbols.popFrame(this);
		}
	};

	return function(resource) {
		console.log(resource.src);
		//try {
			resource.ast.traverse(sause);
			debug(symbols.globalFrame, 10, 1);
		//} catch (e) {
		//	return "failed during AMD preprocessing: " + e.message;
		//}
		return 0;
	};

});
