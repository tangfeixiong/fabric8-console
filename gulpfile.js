var gulp = require('gulp'),
    wiredep = require('wiredep').stream,
    eventStream = require('event-stream'),
    gulpLoadPlugins = require('gulp-load-plugins'),
    map = require('vinyl-map'),
    fs = require('fs'),
    path = require('path'),
    size = require('gulp-size'),
    uri = require('URIjs'),
    urljoin = require('url-join'),
    s = require('underscore.string'),
    hawtio = require('hawtio-node-backend'),
    tslint = require('gulp-tslint'),
    tslintRules = require('./tslint.json');

var plugins = gulpLoadPlugins({});
var pkg = require('./package.json');

var config = {
  main: '.',
  ts: ['plugins/**/*.ts'],
  testTs: ['test-plugins/**/*.ts'],
  less: './less/**/*.less',
  templates: ['plugins/**/*.html'],
  testTemplates: ['test-plugins/**/*.html'],
  templateModule: pkg.name + '-templates',
  testTemplateModule: pkg.name + '-test-templates',
  dist: './dist/',
  js: pkg.name + '.js',
  testJs: pkg.name + '-test.js',
  css: pkg.name + '.css',
  tsProject: plugins.typescript.createProject({
    target: 'ES5',
    module: 'commonjs',
    declarationFiles: true,
    noExternalResolve: false,
    removeComments: true
  }),
  testTsProject: plugins.typescript.createProject({
    target: 'ES5',
    module: 'commonjs',
    declarationFiles: false,
    noExternalResolve: false
  }),
  tsLintOptions: {
    rulesDirectory: './tslint-rules/'
  }
};

var normalSizeOptions = {
    showFiles: true
}, gZippedSizeOptions  = {
    showFiles: true,
    gzip: true
};


gulp.task('bower', function() {
  gulp.src('index.html')
    .pipe(wiredep({}))
    .pipe(gulp.dest('.'));
});

/** Adjust the reference path of any typescript-built plugin this project depends on */
gulp.task('path-adjust', function() {
  gulp.src('libs/**/includes.d.ts')
    .pipe(map(function(buf, filename) {
      var textContent = buf.toString();
      var newTextContent = textContent.replace(/"\.\.\/libs/gm, '"../../../libs');
      // console.log("Filename: ", filename, " old: ", textContent, " new:", newTextContent);
      return newTextContent;
    }))
    .pipe(gulp.dest('libs'));
});

gulp.task('clean-defs', function() {
  return gulp.src('defs.d.ts', { read: false })
    .pipe(plugins.clean());
});

gulp.task('example-tsc', ['tsc'], function() {
  var tsResult = gulp.src(config.testTs)
    .pipe(plugins.typescript(config.testTsProject))
    .on('error', plugins.notify.onError({
      message: '#{ error.message }',
      title: 'Typescript compilation error - test'
    }));

    return tsResult.js
        .pipe(plugins.concat('test-compiled.js'))
        .pipe(gulp.dest('.'));
});

gulp.task('example-template', ['example-tsc'], function() {
  return gulp.src(config.testTemplates)
    .pipe(plugins.angularTemplatecache({
      filename: 'test-templates.js',
      root: 'test-plugins/',
      standalone: true,
      module: config.testTemplateModule,
      templateFooter: '}]); hawtioPluginLoader.addModule("' + config.testTemplateModule + '");'
    }))
    .pipe(gulp.dest('.'));
});

gulp.task('example-concat', ['example-template'], function() {
  return gulp.src(['test-compiled.js', 'test-templates.js'])
    .pipe(plugins.concat(config.testJs))
    .pipe(gulp.dest(config.dist));
});

gulp.task('example-clean', ['example-concat'], function() {
  return gulp.src(['test-templates.js', 'test-compiled.js'], { read: false })
    .pipe(plugins.clean());
});

gulp.task('tsc', ['clean-defs'], function() {
  var cwd = process.cwd();
  var tsResult = gulp.src(config.ts)
    .pipe(plugins.sourcemaps.init())
    .pipe(plugins.typescript(config.tsProject))
    .on('error', plugins.notify.onError({
      message: '#{ error.message }',
      title: 'Typescript compilation error'
    }));

    return eventStream.merge(
      tsResult.js
        .pipe(plugins.concat('compiled.js'))
        .pipe(plugins.sourcemaps.write())
        .pipe(gulp.dest('.')),
      tsResult.dts
        .pipe(gulp.dest('d.ts')))
        .pipe(map(function(buf, filename) {
          if (!s.endsWith(filename, 'd.ts')) {
            return buf;
          }
          var relative = path.relative(cwd, filename);
          fs.appendFileSync('defs.d.ts', '/// <reference path="' + relative + '"/>\n');
          return buf;
        }));
});

gulp.task('tslint', function(){
  gulp.src(config.ts)
    .pipe(tslint(config.tsLintOptions))
    .pipe(tslint.report('verbose'));
});

gulp.task('tslint-watch', function(){
  gulp.src(config.ts)
    .pipe(tslint(config.tsLintOptions))
    .pipe(tslint.report('prose', {
      emitError: false
    }));
});

gulp.task('less', function () {
  return gulp.src(config.less)
    .pipe(plugins.less({
      paths: [ path.join(__dirname, 'less', 'includes') ]
    }))
    .pipe(plugins.concat(config.css))
    .pipe(gulp.dest('./dist'));
});

gulp.task('template', ['tsc'], function() {
  return gulp.src(config.templates)
    .pipe(plugins.angularTemplatecache({
      filename: 'templates.js',
      root: 'plugins/',
      standalone: true,
      module: config.templateModule,
      templateFooter: '}]); hawtioPluginLoader.addModule("' + config.templateModule + '");'
    }))
    .pipe(gulp.dest('.'));
});

gulp.task('concat', ['template'], function() {
  var gZipSize = size(gZippedSizeOptions);
  var license = tslintRules.rules['license-header'][1];
  return gulp.src(['compiled.js', 'templates.js'])
    .pipe(plugins.concat(config.js))
    .pipe(plugins.header(license))
    .pipe(size(normalSizeOptions))
    .pipe(gZipSize)
    .pipe(gulp.dest(config.dist));
});

gulp.task('clean', ['concat'], function() {
  return gulp.src(['templates.js', 'compiled.js'], { read: false })
    .pipe(plugins.clean());
});

gulp.task('watch', ['build', 'build-example'], function() {
  plugins.watch(['libs/**/*.js', 'libs/**/*.css', 'index.html', config.dist + '/' + config.js], function() {
    gulp.start('reload');
  });
  plugins.watch(['libs/**/*.d.ts', config.ts, config.templates], function() {
    gulp.start(['tslint-watch', 'tsc', 'template', 'concat', 'clean']);
  });
  plugins.watch([config.testTs, config.testTemplates], function() {
    gulp.start(['example-tsc', 'example-template', 'example-concat', 'example-clean']);
  });
  plugins.watch(config.less, function(){
    gulp.start('less', 'reload');
  });
});

gulp.task('connect', ['watch'], function() {
  // lets disable unauthorised TLS issues with kube REST API
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  var kubeBase = process.env.KUBERNETES_MASTER || 'https://localhost:8443';
  var kube = uri(urljoin(kubeBase, 'api'));
  var osapi = uri(urljoin(kubeBase, 'osapi'));
  console.log("Connecting to Kubernetes on: " + kube);

  var staticAssets = [{
      path: '/',
      dir: '.'
  }];

  var dirs = fs.readdirSync('./libs');
  dirs.forEach(function(dir) {
    var dir = './libs/' + dir;
    console.log("dir: ", dir);
    if (fs.statSync(dir).isDirectory()) {
      console.log("Adding directory to search path: ", dir);
      staticAssets.push({
        path: '/',
        dir: dir
      });
    }
  });

  var localProxies = [];
  if (process.env.LOCAL_APP_LIBRARY === "true") {
    localProxies.push({
        proto: "http",
        port: "8588",
        hostname: "localhost",
        path: '/kubernetes/api/v1beta2/proxy/services/app-library',
        targetPath: "/"
      });
    console.log("because of $LOCAL_APP_LIBRARY being true we are using a local proxy for /kubernetes/api/v1beta2/proxy/services/app-library" );
  }
  if (process.env.LOCAL_FABRIC8_FORGE === "true") {
    localProxies.push({
        proto: "http",
        port: "8080",
        hostname: "localhost",
        path: '/kubernetes/api/v1beta2/proxy/services/fabric8-forge',
        targetPath: "/"
      });
    console.log("because of LOCAL_FABRIC8_FORGE being true we are using a local proxy for /kubernetes/api/v1beta2/proxy/services/fabric8-forge" );
  }
  if (process.env.LOCAL_GOGS_HOST) {
    var gogsPort = process.env.LOCAL_GOGS_PORT || "3000";
    //var gogsHostName = process.env.LOCAL_GOGS_HOST + ":" + gogsPort;
    var gogsHostName = process.env.LOCAL_GOGS_HOST;
    console.log("Using gogs host: " + gogsHostName);
    localProxies.push({
        proto: "http",
        port: gogsPort,
        hostname: gogsHostName,
        path: '/kubernetes/api/v1beta2/proxy/services/gogs-http-service',
        targetPath: "/"
      });
    console.log("because of LOCAL_GOGS_HOST being set we are using a local proxy for /kubernetes/api/v1beta2/proxy/services/gogs-http-service to point to http://"
    + process.env.LOCAL_GOGS_HOST + ":" + gogsPort);
  }
  var defaultProxies = [{
    proto: kube.protocol(),
    port: kube.port(),
    hostname: kube.hostname(),
    path: '/kubernetes/api',
    targetPath: kube.path()
  }, {
    proto: osapi.protocol(),
    port: osapi.port(),
    hostname: osapi.hostname(),
    path: '/kubernetes/osapi',
    targetPath: osapi.path()
  }, {
    proto: kube.protocol(),
    hostname: kube.hostname(),
    port: kube.port(),
    path: '/jolokia',
    targetPath: '/hawtio/jolokia'
  }, {
    proto: kube.protocol(),
    hostname: kube.hostname(),
    port: kube.port(),
    path: '/git',
    targetPath: '/hawtio/git'
  }];

  var staticProxies = localProxies.concat(defaultProxies);

  hawtio.setConfig({
    port: 9000,
    staticProxies: staticProxies,
    staticAssets: staticAssets,
    fallback: 'index.html',
    liveReload: {
      enabled: true
    }
  });
  var debugLoggingOfProxy = process.env.DEBUG_PROXY === "true";
  hawtio.use('/osconsole/config.js', function(req, res, next) {
    var configJs = 'window.OPENSHIFT_CONFIG = {' +
      ' auth: {' +
      '   oauth_authorize_uri: "' + urljoin(kubeBase, '/oauth/authorize')  + '",' +
      '   oauth_client_id: "fabric8-console",' +
      ' }' +
      '};';
    res.set('Content-Type', 'application/javascript');
    res.send(configJs);
  });
  hawtio.use('/', function(req, res, next) {
          var path = req.originalUrl;
          // avoid returning these files, they should get pulled from js
          if (s.startsWith(path, '/plugins/') && s.endsWith(path, 'html')) {
            console.log("returning 404 for: ", path);
            res.statusCode = 404;
            res.end();
          } else {
            if (debugLoggingOfProxy) {
              console.log("allowing: ", path);
            }
            next();
          }
        });
  hawtio.listen(function(server) {
    var host = server.address().address;
    var port = server.address().port;
    console.log("started from gulp file at ", host, ":", port);
  });
});

gulp.task('reload', function() {
  gulp.src('.')
    .pipe(hawtio.reload());
});

gulp.task('site-fonts', function() {
  return gulp.src(['libs/**/*.woff', 'libs/**/*.woff2', 'libs/**/*.ttf'], { base: '.' })
    .pipe(plugins.flatten())
    .pipe(plugins.debug({title: 'site font files'}))
    .pipe(gulp.dest('site/fonts'));
});

gulp.task('tweak-open-sans', ['site-fonts'], function() {
  return gulp.src('site/fonts/OpenSans*')
    .pipe(plugins.flatten())
    .pipe(gulp.dest('site/fonts/Open-Sans'));
});

gulp.task('tweak-droid-sans-mono', ['site-fonts'], function() {
  return gulp.src('site/fonts/DroidSansMono*')
    .pipe(plugins.flatten())
    .pipe(gulp.dest('site/fonts/Droid-Sans-Mono'));
});

gulp.task('site-files', ['tweak-open-sans', 'tweak-droid-sans-mono'], function() {
  return gulp.src(['images/**', 'img/**', 'libs/**/*.swf'], {base: '.'})
    .pipe(plugins.debug({title: 'site files'}))
    .pipe(gulp.dest('site'));

});

gulp.task('usemin', ['site-files'], function() {
  return gulp.src('index.html')
    .pipe(plugins.usemin({
      css: [plugins.minifyCss(), 'concat'],
      js: [plugins.uglify(), plugins.rev()]
    }))
    .pipe(plugins.debug({title: 'usemin'}))
    .pipe(gulp.dest('site'));
});

gulp.task('site', ['usemin'], function() {
  gulp.src('site/index.html')
    .pipe(plugins.rename('404.html'))
    .pipe(gulp.dest('site'));
  gulp.src(['img/**', 'osconsole/config.js.tmpl'], { base: '.' })
    .pipe(gulp.dest('site'));
  var dirs = fs.readdirSync('./libs');
  var patterns = [];
  dirs.forEach(function(dir) {
    var path = './libs/' + dir + "/img";
    try {
      if (fs.statSync(path).isDirectory()) {
        console.log("found image dir: " + path);
        var pattern = 'libs/' + dir + "/img/**";
        patterns.push(pattern);
      }
    } catch (e) {
      // ignore, file does not exist
    }
  });
  return gulp.src(patterns).pipe(plugins.debug({ title: 'img-copy' })).pipe(gulp.dest('site/img'));
});

gulp.task('serve-site', function() {
  // lets disable unauthorised TLS issues with kube REST API
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  var kubeBase = process.env.KUBERNETES_MASTER || 'https://localhost:8443';
  var kube = uri(urljoin(kubeBase, 'api'));
  var osapi = uri(urljoin(kubeBase, 'osapi'));
  console.log("Connecting to Kubernetes on: " + kube);
  var staticAssets = [{
      path: '/',
      dir: 'site/'
  }];
  var dirs = fs.readdirSync('site/libs');
  dirs.forEach(function(dir) {
    dir = 'site/libs/' + dir;
    console.log("dir: ", dir);
    if (fs.statSync(dir).isDirectory()) {
      console.log("Adding directory to search path: ", dir);
      staticAssets.push({
        path: '/',
        dir: dir
      });
    }
  });
  var localProxies = [];
  if (process.env.LOCAL_APP_LIBRARY === "true") {
    localProxies.push({
        proto: "http",
        port: "8588",
        hostname: "localhost",
        path: '/kubernetes/api/v1beta2/proxy/services/app-library',
        targetPath: "/"
      });
    console.log("because of $LOCAL_APP_LIBRARY being true we are using a local proxy for /kubernetes/api/v1beta2/proxy/services/app-library" );
  }
  if (process.env.LOCAL_FABRIC8_FORGE === "true") {
    localProxies.push({
        proto: "http",
        port: "8080",
        hostname: "localhost",
        path: '/kubernetes/api/v1beta2/proxy/services/fabric8-forge',
        targetPath: "/"
      });
    console.log("because of LOCAL_FABRIC8_FORGE being true we are using a local proxy for /kubernetes/api/v1beta2/proxy/services/fabric8-forge" );
  }
  if (process.env.LOCAL_GOGS_HOST) {
    var gogsPort = process.env.LOCAL_GOGS_PORT || "3000";
    //var gogsHostName = process.env.LOCAL_GOGS_HOST + ":" + gogsPort;
    var gogsHostName = process.env.LOCAL_GOGS_HOST;
    console.log("Using gogs host: " + gogsHostName);
    localProxies.push({
        proto: "http",
        port: gogsPort,
        hostname: gogsHostName,
        path: '/kubernetes/api/v1beta2/proxy/services/gogs-http-service',
        targetPath: "/"
      });
    console.log("because of LOCAL_GOGS_HOST being set we are using a local proxy for /kubernetes/api/v1beta2/proxy/services/gogs-http-service to point to http://"
    + process.env.LOCAL_GOGS_HOST + ":" + gogsPort);
  }
  var defaultProxies = [{
    proto: kube.protocol(),
    port: kube.port(),
    hostname: kube.hostname(),
    path: '/kubernetes/api',
    targetPath: kube.path()
  }, {
    proto: osapi.protocol(),
    port: osapi.port(),
    hostname: osapi.hostname(),
    path: '/kubernetes/osapi',
    targetPath: osapi.path()
  }, {
    proto: kube.protocol(),
    hostname: kube.hostname(),
    port: kube.port(),
    path: '/jolokia',
    targetPath: '/hawtio/jolokia'
  }, {
    proto: kube.protocol(),
    hostname: kube.hostname(),
    port: kube.port(),
    path: '/git',
    targetPath: '/hawtio/git'
  }];

  var staticProxies = localProxies.concat(defaultProxies);
  hawtio.setConfig({
    port: 2772,
    staticProxies: staticProxies,
    staticAssets: staticAssets,
    fallback: 'site/404.html',
    liveReload: {
      enabled: false
    }
  });
  var debugLoggingOfProxy = process.env.DEBUG_PROXY === "true";
  hawtio.use('/osconsole/config.js', function(req, res, next) {
    var configJs = 'window.OPENSHIFT_CONFIG = {' +
      ' auth: {' +
      '   oauth_authorize_uri: "' + urljoin(kubeBase, '/oauth/authorize')  + '",' +
      '   oauth_client_id: "fabric8-console",' +
      ' }' +
      '};';
    res.set('Content-Type', 'application/javascript');
    res.send(configJs);
  });
  hawtio.listen(function(server) {
    var host = server.address().address;
    var port = server.address().port;
    console.log("started from gulp file at ", host, ":", port);
  });
});

gulp.task('build', ['bower', 'path-adjust', 'tslint', 'tsc', 'less', 'template', 'concat', 'clean']);

gulp.task('build-example', ['example-tsc', 'example-template', 'example-concat', 'example-clean']);

gulp.task('default', ['connect']);



