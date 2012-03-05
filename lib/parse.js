define(["build/buildControl", "bdParse"], function(bc, parse) {

	var
		tLineComment= parse.symbols["tLineComment"],
		tBlockComment= parse.symbols["tBlockComment"],
		filterComments= function(
			tokens //(array of tokens) tokens to filter
		) {
			///
			// Filters comments from token stream by removing them and attaching them to the nearest noncomment token. //This
			// allows AST traversals to pull metadata from comments in the context of the AST.
			//
			// Two kinds of comments are possible:
			//
			//   1. Those that are contiguous (by line number) with a non-comment token.
			//   2. Those that are surrounded by a blank line.
			//
			// Comments of Type 1 are gathered and attached to the continguous non-comment token at the property comment. Comments of Type 2
			// are termed comment islands and there may be several such islands between non-comment tokens. All such islands are gathered
			// and attached to the next non-comment token at the property commentIslands (a vector), with each island providing a separate
			// entry into the commentIslands vector. Notice that a token stream ends with a set of comment islands, all of thos comment islands
			// will be attached to the terminating tEof token.
			var filtered= [],
				item, commentBlock, commentIslands = [], i = 0, end = tokens.length,
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
				getCommentBlock = function(item, consumeIslands){
					var result = [item], nextItem;
					while(i<end){
						nextItem = tokens[i];
						if(isComment(nextItem)){
							if(isContiguous(item, nextItem)){
								result.push((item = nextItem));
								i++;
							}else if(consumeIslands){
								// a non-contiguous comment; therefore the current result is a comment island
								commentIslands.push(result);
								result = [item = nextItem];
							}else{
								break;
							}
						}else{
							// either nextItem isn't a comment
							break;
						}
					}
					return result;
				};
			while(i<end){
				item = tokens[i++];
				if(isComment(item)){
					commentBlock = getCommentBlock(item, true);
					// tokens[i++] must exist and will not be a comment since all token streams end with tEof
					item = tokens[i++];
				}else{
					commentBlock = [];
				}
				if(i<end && isComment(tokens[i]) && isContiguous(item, tokens[i])){
					// the next token is a comment that is contiguous to the current noncomment token
					commentBlock = commentBlock.concat(getCommentBlock(tokens[i++], false));
				}
				if(commentBlock.length){
					item.comment = commentBlock;
				}
				if(commentIslands.length){
					item.commentIslands = commentIslands;
					commentIslands = [];
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
			console.log(e);
		}
	};
});
