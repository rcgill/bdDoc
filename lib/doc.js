///
// `name Description
//
// WARNING
// =======
//
// The bdDoc documentation parser is under construction and *not* all of the features described in this manual have been fully implemented.
//
//
// Motivation
// ==========
//
// The purpose of a document parser is to harvest documentation from source code. At it's core, a document parser finds document
// chunks in source code, matches those chunks to public names, and outputs the resulting map for a set of source modules. Let's
// look at an example.
//
doc(function(){
	define(["someLib/circle"], function(circle){
		// do something interesting with circle...
		console.log(circle.area(7));
    });
});
// Here, some library author has published the module `"someLib/circle"` that provides the function `area`.
// Hopefully the author has also provided a reference manual that explains the semantics of `area()`, and the user
// can consult the `"circle".area` entry in the manual provided with the someLib library to find that
// documentation.
//
// With a document parser, the library author may document public APIs in line with the source code. For example, the `"someLib/circle"`
// module might look like this:
doc(function(){
	// this code resides in the resource associated with module "someLib/circle"
	define({
		area:function(
			r //(number) radius of circle
		){
			///
			// Computes and returns the area of a circle with radius `r`.

			// (number) The area of a circle with radius r.
			return Math.Pi * r * r;
		}
	});
});
// The document parser can process the source code and construct a map that has the entry "someLib/circle".area which contains
// a document chunk that explains the item is a function that takes one argument, a number, that represents the radius of a circle
// and returns the area of a circle with the provided radius.
//
// The key advantage to this kind of system is that the documentation for an API entry is contemperaneous with the implementation which
// eases the burden of maintaining accurate docs compared to editing/managing two independent sources. Further, an intelligent doc
// parser can harvest important attributes directly from the source code. For example, given the code above, a doc parser can determine
//
// 1. There is a module name `"someLib/circle"` that has a public API.
// 2. The module `"someLib/circle"` publishes the an object.
// 3. The object published by `"someLib/circle"` contains the property area, which is a function.
// 4. The function `area` takes a single argument named `r`.
//
// These attributes are "free" in that not a single comment is required to harvest them.
//
//
// Overview
// ========
//
// bdDoc is a document parser that harvests documentation from JavaScript source code. The program recognizes several different documentation
// systems:
//
//   * Dojo
//   * backdraft
//   * JsDoc
//
// Similarly, bdDoc can output the resulting map in several formats:
//
//   * HTML
//   * Markdown
//   * XML, compatible with the Dojo API reader
//   * JSON, compatible with the backdraft API reader
//
// bdDoc is implemented in terms of a few, fairly short transforms that may be used with the dojo/backdraft build system.
//
// Installation and Operation
// ==========================
//
// In addition to bdDoc itself, the following libraries are required.
//
// 1. Dojo
// 2. The Dojo build system
// 3. bdParser
//
// bdDoc has been built and tested with the following directory organization:
//
// bdDoc/
// bdParse/
// dtk/
//   dojo/
//   util/
//
// Assuming this organization, bdDoc may be invoked by executing the shell script "bdDoc.sh" located in bdDoc/. bdDoc.sh functions
// exactly like the build script provided with the dojo builder in dtk/util/buildscripts/build.sh. The profile need only indicate the
// list of resources, typically packages, that should be processed. For example
//
// TODO
//
// How Documents of Found and Mapped
// =================================
//
// bdDoc parses source files and matches inline documents with public names. Inline document chunks intended to be harvested
// must include some special sequence in order to deliniate them from normal code comments as follows:
//
// Document chunks intended to be interpretted as Dojo inline documents must include a line the begins with /\s+\S+\:/.
// For example:
//
///code
// // summary:
// // etc.
//
// /*
//    summary:
//    etc.
// */
//
// /*
//
//
// Places where doc blocks can be placed:
//
// 1. At a variable declaration
// 2. At any operator=
// 3. At a property definition in a literal object
// 4. At a function definition
// 5. At a function parameter definition
// 6. At a return statement
//
// Any potential doc block is filtered IAW the profile settings. Any doc block that fails to hold markers that indicate it
// is a doc block is ignored.
//
// After all doc blocks and symbols are found, the source is p-executed top-to-bottom.
//  whitespace (other than