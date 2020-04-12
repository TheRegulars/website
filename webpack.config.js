const path = require('path');
const ClosurePlugin = require('closure-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ScriptExtHtmlWebpackPlugin = require('script-ext-html-webpack-plugin');

var webpackMode = 'development';

if (process.env.PRODUCTION) {
    webpackMode = 'production';
}


var htmlMinifyOpts = {
    collapseWhitespace: true,
    conservativeCollapse: true,
    removeComments: true,
};

module.exports = {
    entry: './src/dptext.ts',
    output: {
        filename: "assets/bundle.[hash].js",
        path: path.join(__dirname, "dist")
    },
    plugins: [
        new CleanWebpackPlugin(),
        new HtmlWebpackPlugin({
            minify: htmlMinifyOpts,
            template: 'html/index.html',
            filename: 'index.html'
        }),
        new HtmlWebpackPlugin({
            minify: htmlMinifyOpts,
            template: 'html/records.html',
            filename: 'records.html'
        }),
        new ScriptExtHtmlWebpackPlugin({defaultAttribute: 'async'})
    ],
    resolve: {
        extensions: ['.ts', '.tsx', '.js']
    },
    devtool: "source-map",
    devServer: {
        contentBase: path.join(__dirname, "dist"),
        port: 9000
    },
    optimization: {
        minimizer: [
            new ClosurePlugin({mode: 'STANDARD'}, {})
        ],
    },
    mode: webpackMode,
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: [{loader: 'ts-loader', options: {transpileOnly: true}}]
            }
        ]
    }
};
