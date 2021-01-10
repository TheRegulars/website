const path = require('path');

module.exports = function(config) {
    config.set({
        frameworks: ['mocha', 'chai'],
        browsers: ["ChromeHeadless", "FirefoxHeadless"],
        files: [
            {pattern: "tests/**/*.ts"}
        ],
        preprocessors: {
            "tests/**/*.ts": ["webpack"]
        },
        webpack: {
            resolve: {
                extensions: ['.ts', '.tsx', '.js'],
                modules: ['node_modules'], // maybe add src ?
            },
            devtool: "source-map",
            mode: "development",
            module: {
                rules: [
                    {
                        test: /\.tsx?$/,
                        exclude: /node_modules/,
                        use: [
                            "@jsdevtools/coverage-istanbul-loader",
                            {loader: 'ts-loader', options: {transpileOnly: true}}
                        ]
                    },
                    {
                        test: /\.m?js$/,
                        exclude: /node_modules/,
                        use: [{loader: 'babel-loader', options: {presets: ['@babel/preset-env']}}]
                    },
                ]
            },
        },
        mime: {
            'text/x-typescript': ['ts', 'tsx']
        },
        webpackMiddleware: {
            noInfo: true
        },
        plugins: [
            'karma-mocha',
            'karma-chai',
            'karma-webpack',
            'karma-chrome-launcher',
            'karma-firefox-launcher',
            'karma-coverage-istanbul-reporter',
            'karma-mocha-reporter'
        ],
        reporters: ["progress", "coverage-istanbul", "mocha"],
        autoWatch: false,
        coverageIstanbulReporter: {
            reports: ['text', 'text-summary'],
            dir: path.join(__dirname, "coverage"),
            combineBrowserReports: true,
            fixWebpackSourcePaths: true,
            skipFilesWithNoCoverage: true,
        },
    });
}
