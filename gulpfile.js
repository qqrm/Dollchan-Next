const { spawn } = require('node:child_process');
const gulp = require('gulp');

gulp.task('build:firefox', callback => {
	const child = spawn(process.execPath, ['scripts/build-firefox.mjs'], { stdio: 'inherit' });
	child.once('error', callback);
	child.once('exit', code => code === 0 ? callback() : callback(new Error(`Build exited with ${ code }`)));
});

gulp.task('default', gulp.series('build:firefox'));
