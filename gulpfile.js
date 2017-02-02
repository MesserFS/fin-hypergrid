﻿/// <binding BeforeBuild='build' />
/* global Buffer, require */
'use strict';

const gulp = require('gulp'),
    chmod = require('gulp-chmod'),
    $$ = require('gulp-load-plugins')(),
    runSequence = require('run-sequence'),
    browserSync = require('browser-sync').create(),
    exec = require('child_process').exec,
    path = require('path'),
    pipe = require('multipipe');
    

const sass = require('gulp-sass'),
    using = require('gulp-using'),
    glob = require("glob"),
    merge = require("merge-stream"),
    through2 = require("through2");

const finHypergridCurrDir = './Scripts/src/fin-hypergrid/2.0/',
    finHypergridSrcDir = finHypergridCurrDir + '/src/',
    finHypergridJsFiles = finHypergridCurrDir + '**/*.js',
    finHypergridBuildDir = './Scripts/core/DataView/fin-hypergrid/2.0/';

const mfsHypergridCurrDir = './Scripts/src/mfs-hypergrid/2.0/',
    mfsHypergridSrcDir = mfsHypergridCurrDir + '/src/',
    mfsHypergridJsFiles = mfsHypergridCurrDir + '**/*.js',
    mfsHypergridBuildDir = './Scripts/core/DataView/fin-hypergrid/2.0/';

//  //  //  //  //  //  //  //  //  //  //  //
gulp.task('unlock', unlock);

gulp.task('lint', lint);
gulp.task('doc', doc);
gulp.task('beautify', beautify);
gulp.task('images', swallowImages);
gulp.task('browserify', browserify);
gulp.task('reloadBrowsers', reloadBrowsers);
gulp.task('serve', browserSyncLaunchServer);

gulp.task('sass', sass_task);

gulp.task('build', function (callback) {
    clearBashScreen();
    runSequence(
        'lint',
        'unlock',
        'images',
        'sass',
        'browserify'
    );
});

gulp.task('watch', function () {
    gulp.watch([finHypergridSrcDir + '**', testDir + '**'], ['build']);
    //.on('change', function(event) {
    //    browserSync.reload();
    //});
});

gulp.task('default', ['build'], browserSyncLaunchServer);

//  //  //  //  //  //  //  //  //  //  //  //

function lint() {
    return gulp.src([finHypergridJsFiles, mfsHypergridJsFiles, '!' + finHypergridSrcDir + '**/old/**/'])
        .pipe($$.eslint()) // specify version in .eslintrc.json
        .pipe($$.eslint.format())
        .pipe($$.eslint.failAfterError());
}

function unlock() {
    require("child_process").exec("attrib -R " + finHypergridCurrDir + 'images/images.js');
    require("child_process").exec("attrib -R " + finHypergridBuildDir + "*.js /s");
}

function beautify() {
    return gulp.src(finHypergridJsFiles)
        .pipe($$.beautify()) //apparent bug: presence of a .jsbeautifyrc file seems to force all options to their defaults (except space_after_anon_function which is forced to true) so I deleted the file. Any needed options can be included here.
        .pipe(gulp.dest(finHypergridSrcDir));
}

function sass_task() {
    var themesPath = "./Sass/ThemeVariables/";
        
    const theme_tasks = glob("./Sass/ThemeVariables/*.scss", function (er, files) {
        files.map(filename => path.basename(filename, '.scss')).forEach((themeName) => {
            gulp.src("./Sass/Common/**/*.scss")
                .pipe(through2.obj(function (file, enc, next) {
                    const themedFile = file.clone();                    
                    themedFile.contents = Buffer.concat([new Buffer(`$current-theme-name: "${themeName}"; @import '${path.join(themesPath, themeName + ".scss").replace(/\\/g, "/")}'; `), themedFile.contents]);
                    themedFile.path = path.join("./Sass/Common/" + themeName, path.relative("Sass/Common", themedFile.path));
                    this.push(themedFile);
                    next();
                }))
                .pipe(sass())
                .pipe(through2.obj(function (file, enc, next) {
                    this.push(file);
                    next();
                }))
                .pipe(gulp.dest("./Content/themes/"));
        });
    });

    const color_task = gulp.src(["./Sass/Color/normal.scss", "./Sass/Color/outline.scss"])
        .pipe(sass())
        .pipe(gulp.dest("./Content/custom-color/"));
    return;
}

function browserify() {
    const browserifyConfigurations = [
        {
            "srcFile": finHypergridSrcDir + 'index.js',
            "renameFileName": 'fin-hypergrid-mfs',
            "destDir": finHypergridBuildDir
        },
        {
            "srcFile": mfsHypergridSrcDir + 'index.js',
            "renameFileName": 'mfs-realtime-hypergrid',
            "destDir": mfsHypergridBuildDir
        }
    ];
    browserifyConfigurations.forEach(config => {
        gulp.src(config.srcFile)
        .pipe(
            $$.mirror(
                pipe(
                    $$.rename(config.renameFileName + '.js'),
                    $$.browserify({ debug: true })
                        .on('error', $$.util.log)
                ),
                pipe(
                    $$.rename(config.renameFileName + '.min.js'),
                    $$.browserify() /* ,
                    $$.uglify() */ // Disabled until uglify officially supports ES6
                        .on('error', $$.util.log)
                )
            )
        )
        .pipe(gulp.dest(config.destDir));
    });
    
}

function doc(cb) {
    exec(path.resolve('jsdoc.sh'), function (err, stdout, stderr) {
        console.log(stdout);
        console.log(stderr);
        cb(err);
    });
}

function browserSyncLaunchServer() {
    browserSync.init({
        server: {
            // Serve up our build folder
            baseDir: finHypergridBuildDir
        },
        port: 9000
    });
}

function reloadBrowsers() {
    browserSync.reload();
}

function clearBashScreen() {
    const ESC = '\x1B';
    console.log(ESC + 'c'); // (VT-100 escape sequence)
}

function swallowImages() {
    const config = {
        src: {
            globs: [finHypergridCurrDir + 'images/*.png', finHypergridCurrDir + 'images/*.gif', finHypergridCurrDir + 'images/*.jpeg', finHypergridCurrDir + 'images/*.jpg'],
            options: {}
        },
        transform: {
            options: {},
            header: '',
            footer: ''
        },
        dest: {
            path: finHypergridCurrDir + 'images',
            filename: 'images.js',
            header: 'module.exports = { // This file generated by gulp-imagine-64 at '
                + (new Date).toLocaleTimeString() + ' on '
                + (new Date).toLocaleDateString() + '\n',
            footer: '\n};\n',
            options: {}
        }
    };

    return gulp.src(config.src.globs, config.src.options)
        .pipe($$.imagine64(config.transform.options))
        .pipe($$.header(config.transform.header))
        .pipe($$.footer(config.transform.footer))
        .pipe($$.concat(config.dest.filename))
        .pipe($$.header(config.dest.header))
        .pipe($$.footer(config.dest.footer))
        .pipe(gulp.dest(config.dest.path, config.dest.options));
}
