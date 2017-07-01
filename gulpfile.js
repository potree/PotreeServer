
const gulp = require('gulp');
const concat = require('gulp-concat');
const size = require('gulp-size');
const spawn = require('child_process').spawn;

var node;

//var path = require('path');
//var rename = require('gulp-rename');
//var uglify = require('gulp-uglify');
//var gutil = require('gulp-util');
//var through = require('through');
//var os = require('os');
//var File = gutil.File;


let paths = {
	server : [
		"src/workers/Worker.js",
		"src/workers/PotreeExtractRegionWorker.js",
		"src/potree_server.js",
	],
	settings: [
		"resources/settings.json"
	],
	resources: [
		"resources/**/*"
	],
	www: [
		"www/**/*"
	]
};


gulp.task("build", [], function(){
	gulp.src(paths.server)
		.pipe(concat('potree_server.js'))
		.pipe(size({showFiles: true}))
		.pipe(gulp.dest('build/potree_server'));
		
	gulp.src(paths.settings)
		.pipe(gulp.dest('build/potree_server'));
		
	gulp.src(paths.resources)
		.pipe(gulp.dest('build/potree_server/resources'));
		
	gulp.src(paths.www)
		.pipe(gulp.dest('build/potree_server/www'));

	return;
});

gulp.task("server", function(){
	if(node){
		node.kill();
	}	
	
	node = spawn('node', ['./build/potree_server/potree_server.js'], {stdio: 'inherit'})
	node.on('close', (code) => {
		if(code === 8){
			gulp.log('Error detected, waiting for changes...');
		}
	});
});

gulp.task('watch', function() {
	gulp.run("build");
	gulp.run("server");
	
    gulp.watch(['src/**/*.js', 'resources/**/*', 'www/**/*'], function(){
		gulp.run("build");
		gulp.run("server");
	});
});

process.on('exit', function() {
    if (node) node.kill()
});