define(["build/buildControl", "bdParse"], function(bc, bdParse) {
	// TODO: remove after dev
	bc.bdDoc = bc.bdDoc || {};
	bc.bdDoc.dojoConsumeCommentCodeBlocks = 1;

	var
		split = bdParse.split,
		tokenize = bdParse.tokenize,
		parse = bdParse.parse,
		tLineComment=bdParse.symbols["tLineComment"],
		tBlockComment=bdParse.symbols["tBlockComment"],

		locationText = function(node){
			var location = node.location;
			while(node.parent){
				node = node.parent;
			}
			return node.resource.src + "(" + location.startLine + ")";
		},

		dojoConsumeCommentCodeBlocks = function(
			tokens //(array of tokens) tokens to scan
		){
			///
			// Scans tokens for dojo doc "/*=====" blocks. Converts any blocks found into tokens
			// and replaces block comment token with converted tokens.

			// TODO: parse the new token stream to make sure it's legal; warn and ignore if not

			var filtered= [],
				item, text, offset, newTokens, i = 0, end = tokens.length;
			while(i<end){
				item = tokens[i++];
				if(item.type==tBlockComment && /\/\*=====/.test(item.value)){
					text = item.value.replace(/^\/\*[=]+/, "").replace(/[=]+\*\//, "");
					if(/\/\*=====/.test(text)){
						throw new Error("nested dojo p-code block");
					}
					offset = item.location.startLine;
					newTokens = tokenize(split(text)).map(function(token){ token.location.offsetLine(offset); return token; });
					// pop off the EOF token
					newTokens.pop();
					filtered = filtered.concat(newTokens);
				}else{
					filtered.push(item);
				}
			}
			return filtered;
		},

		filterComments= function(
			tokens //(array of tokens) tokens to filter
		) {
			///
			// Filters comments from token stream by removing them and attaching them to the nearest noncomment token. //This
			// allows AST traversals to pull metadata from comments in the context of the AST.
			//
			// Two kinds of comments are possible:
			//
			//   1. Those that are contiguous with a non-comment token. Contiguous means the comment is on the previous, same,
			//      or next line as the non-comment token. These tokesn are gathered and attached to the continguous non-comment
			//      token at the property comment.
			//
			//   2. Those that are surrounded by a blank line. Comments of this type are termed comment islands and there may
			//      be several such islands between non-comment tokens. All such islands are gathered and attached to the previous
			//		non-comment token (if any) at commentIslandsAfter and then next non-comment token (of which there will always
			//		be one since every token stream ends with tEof) at commentIslandsBefore.
			//
			// This design ultimately allows the doc parser to decide how to interpret the comment islands, if at all.
			// Notice that the same comment island vector is referenced at both the commentIslandsBefore and commentIslandsAfter
			// property, so the doc comment parser can empty this vector to signal that it has been processed.

			var filtered= [],
				item, lastNoncommentItem, commentBlock, commentIslands = [], i = 0, end = tokens.length,
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
					if(lastNoncommentItem){
						commentIslands.beforeItem = lastNoncommentItem;
						lastNoncommentItem.commentIslandsAfter = commentIslands;
					}
					commentIslands.afterItem = item;
					item.commentIslandsBefore = commentIslands;
					commentIslands = [];
				}
				filtered.push((lastNoncommentItem = item));
			}
			return filtered;
		};

	return function(resource, callback) {
		try{
			var text = split(resource.getText()),
				tokens = tokenize(text);
			if(bc.bdDoc.dojoConsumeCommentCodeBlocks){
				tokens = dojoConsumeCommentCodeBlocks(tokens);
			}
			tokens = filterComments(tokens);
			resource.text = text;
			resource.tokens = tokens;
			resource.ast = parse(tokens);
			resource.ast.resource = resource;
		}catch(e){
			console.log("failed to parse: " + resource.src);
			console.log(e);
			console.log(e.stack);
		}
	};
});
