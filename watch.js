
const fs = require("fs");
const spawn = require('child_process').spawn;


let watch = (function(){

	let directory = null;
	let history = {};
	let scheduled = null;

	return function(_directory, callback){
		directory = _directory;

		fs.watch(directory, {recursive: true}, (type, filename) => {

			if(scheduled === null){
				setTimeout(() => {
					callback(...scheduled);	
					scheduled = null;
				}, 10);
			}

			scheduled = [type, filename];

		});
	};

})();


let node = null;

function restartServer(){
	
	if(node){
		node.kill();
	}

	let content = fs.readFileSync("./src/test.js", "utf8");
	console.log("content: ", content);

	node = spawn('node', ['./src/potree_server.js'], {stdio: 'inherit'})

}

watch("./src", (type, filename) => {
	restartServer();
});

restartServer();