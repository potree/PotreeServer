
const gulp = require('gulp');
//const concat = require('gulp-concat');
//const size = require('gulp-size');
const spawn = require('child_process').spawn;

var node;


gulp.task("server", function(){
	if(node){
		node.kill();
	}	
	
	//node = spawn('node', ['./src/potree_server.js'], {stdio: 'inherit'})
	node = spawn('node', ['./src/potree_server.js'], {stdio: 'inherit'})

	node.on('close', (code) => {
		if(code === 8){
			gulp.log('Error detected, waiting for changes...');
		}
	});
});

gulp.task('watch', function() {
	gulp.run("server");
	
	gulp.watch(['src/**/*.js', 'resources/**/*', 'www/**/*'], function(){
		gulp.run("server");
	});
});

process.on('exit', function() {
    if (node) node.kill()
});