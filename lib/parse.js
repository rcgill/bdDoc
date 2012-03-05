define(["build/buildControl", "bdParse"], function(bc, parse) {

	var
		tLineComment= parse.symbols["tLineComment"],
		tBlockComment= parse.symbols["tBlockComment"],
		filterComments= function(
			tokens //(array of tokens) tokens to filter
		) {
			///
			//
			//
			var filtered= [],
				item, commentBlock, i = 0, end = tokens.length,
				back = function(array){
					return array[array.length-1];
				},
				isComment = function(item){
					return item.type==tLineComment || item.type==tBlockComment;
				},
				isContiguous = function(item1, item2){
					// item 1 ends is on the same or previous line as item2 starts
					return item1.location.endLine+1 >= item2.location.startLine;
				},
				getCommentBlock = function(item){
					var result = [item], nextItem;
					while(i<end){
						nextItem = tokens[i];
						if(isComment(nextItem) && isContiguous(item, nextItem)){
							result.push((item = nextItem));
							i++;
						}else{
							break;
						}
					}
					return result;
				};
			while(i<end){
				item = tokens[i++];
				if(isComment(item)){
					commentBlock = getCommentBlock(item);
					// tokens[i++] must exist and will not be a comment since all token streams end with tEof
					item = tokens[i++];
					if(!isContiguous(back(commentBlock), item)){
						// this was a comment island, not associated with any other token
						commentBlock[0].comment = commentBlock;
						filtered.push(commentBlock[0]);
						commentBlock = [];
					}
				}else{
					commentBlock = [];
				}
				if(i<end && isComment(tokens[i]) && isContiguous(item, tokens[i])){
					// the next token is a comment that is contiguous to the current noncomment token
					commentBlock = commentBlock.concat(getCommentBlock(tokens[i++]));
				}
				if(commentBlock.length){
					item.comment = commentBlock;
				}
				filtered.push(item);
			}
			return filtered;
		};

	return function(resource, callback) {
		try{
			var result = parse.parseText(resource.getText(), filterComments);
			resource.text = result[0];
			resource.ast = result[1];
			resource.tokens = result[2];
		}catch(e){
			// TODO
			console.log("failed to parse: " + resource.src);
		}
	};
});
