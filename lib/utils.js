define([], function(){
	var
		locationText = function(node){
			var location = node.location;
			while(node.parent){
				node = node.parent;
			}
			return node.resource.src + "(" + location.startLine + ")";
		};

	return {
		locationText:locationText
	};
});
