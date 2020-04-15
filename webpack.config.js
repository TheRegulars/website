const path = require('path');
const ClosurePlugin = require('closure-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ScriptExtHtmlWebpackPlugin = require('script-ext-html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const OptimizeCssAssetsPlugin = require('optimize-css-assets-webpack-plugin');

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
    entry: [
        './src/components.ts',
        './src/style.css'
    ],
    output: {
        filename: "assets/bundle.[hash].js",
        path: path.join(__dirname, "dist")
    },
    plugins: [
        new CleanWebpackPlugin(),
        new CopyPlugin([
            { from: 'static/favicon.ico', to: 'favicon.ico'},
            { from: 'static/favicon-192x192.png', to: 'images/favicon-192x192.png'},
            { from: 'static/apple-touch-icon.png', to: 'images/apple-touch-icon.png'},
            { from: 'static/images/logo.png', to: 'images/logo.png'},
            { from: 'static/fonts/', to: 'fonts/'}
        ]),
        new HtmlWebpackPlugin({
            minify: htmlMinifyOpts,
            template: 'html/index.html',
            filename: 'index.html'
        }),
        new ScriptExtHtmlWebpackPlugin({defaultAttribute: 'async'}),
        new MiniCssExtractPlugin({
            filename: 'assets/style.[hash].css'
        })
    ],
    resolve: {
        extensions: ['.ts', '.tsx', '.js']
    },
    devtool: "source-map",
    devServer: {
        contentBase: path.join(__dirname, "dist"),
        port: 9000,
        historyApiFallback: true,
    },
    optimization: {
        minimizer: [
            new ClosurePlugin({mode: 'STANDARD'}, {
                compilation_level: "SIMPLE",
                language_in: 'ECMASCRIPT_2018',
                language_out: 'ES6_STRICT'
            }),
            new OptimizeCssAssetsPlugin({})
        ],
    },
    mode: webpackMode,
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: [{loader: 'ts-loader', options: {transpileOnly: true}}]
            },
            {
                test: /\.css$/i,
                exclude: /node_modules/,
                use: [
                    {loader: MiniCssExtractPlugin.loader, options: {publicPath: 'assets/'}},
                    {loader: 'css-loader', options: {url: false}},
                    'postcss-loader'
                ]
            }
        ]
    }
};