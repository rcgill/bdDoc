var profile = (function(){
	require({
		packages:[{
			name:"bdDoc",
			location:selfPath
		},{
			name:"bdParse",
			location:selfPath + "/../../bdParse/lib"
		}]
	});

	return {
		layers: 0,

		messageCategories:{
			info:[1000, 1099]
		},

		messages:[
			[1, 1000, "notProcessed", "Resource ignored."]
		],

		transforms:{
			parse:["bdDoc/parse", "read"],
			findAllScopes:["bdDoc/findAllScopes", "read"]
			//docGen:["bdDoc/docGen", "read"]
		},

		transformJobs:[[
			// all javascript resources are scanned for documentation
			function(resource, bc) {
				if(0){
					if(resource.mid=="dojo/AdapterRegistry"){
						return 1;
					}
					return 0;
				}

				return /\.js$/.test(resource.src);
			},
			["read", "parse", "findAllScopes"]
		],[
			// the synthetic report module
			function(resource) {
				return resource.tag.report;
			},
			["dojoReport", "report"]

		],[
			// everything else is just ignored
			function(resource, bc) {
				bc.log("notProcessed", ["filename", resource.src]);
				return true;
			},
			[]
		]]
	};
})();
