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

		docBlockParsers:[
			"bdDoc/docBlockParsers/dojo",
			"bdDoc/docBlockParsers/backdraft",
			"bdDoc/docBlockParsers/jsdoc"
		],

		transforms:{
			parse:["bdDoc/parse", "read"],
			findAllScopes:["bdDoc/findAllScopes", "read"],
			docGen:["bdDoc/docGen", "ast"]
		},

		transformJobs:[[
			// all javascript resources are scanned for documentation
			function(resource, bc) {
				if(0){
					var process = {
						"dojo/AdapterRegistry":0,
						"dojo/_base/kernel":1,
						"dojo/_base/array":1
					};
					if(process[resource.mid]){
						return 1;
					}
					return 0;
				}

				return /\.js$/.test(resource.src);
			},
			["read", "parse", "findAllScopes", "docGen"]
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
