const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const { InjectManifest } = require('workbox-webpack-plugin');
const { DefinePlugin } = require('webpack');
const Terser = require('terser-webpack-plugin');

var webpackMode = 'development';

if (process.env.PRODUCTION) {
    webpackMode = 'production';
}


var htmlMinifyOpts = {
    collapseWhitespace: true,
    conservativeCollapse: true,
    removeComments: true,
};

const excludePattern = /node_modules\/(?!(@?lit|workbox))/i;
const babelLoader = {
    loader: 'babel-loader',
    options: {presets: [['@babel/preset-env', {useBuiltIns: "usage", corejs: 3}]]}
};

module.exports = {
    entry: {
        main: ['./src/polyfills.js', './src/main.ts'],
        style: './src/style.css'
    },
    output: {
        filename: "assets/[name].bundle.[fullhash].js",
        path: path.join(__dirname, "dist")
    },
    plugins: [
        new CleanWebpackPlugin(),
        new DefinePlugin({
            MAPSHOT_BASE_URL: JSON.stringify("https://dl.regulars.win/mapshots/")
        }),
        new CopyPlugin({
            patterns: [
                { from: 'static/favicon.ico', to: 'favicon.ico'},
                { from: 'static/favicon-192x192.png', to: 'images/favicon-192x192.png'},
                { from: 'static/favicon-96x96.png', to: 'images/favicon-96x96.png'},
                { from: 'static/apple-touch-icon.png', to: 'images/apple-touch-icon.png'},
                { from: 'static/images/', to: 'images/'},
                { from: 'static/fonts/', to: 'fonts/'},
                { from: 'static/robots.txt', to: 'robots.txt'},
                { from: 'static/sitemap.xml', to: 'sitemap.xml'},
                { from: 'static/manifest.json', to: 'manifest.webmanifest'}
            ]
        }),
        new HtmlWebpackPlugin({
            minify: htmlMinifyOpts,
            template: 'html/index.html',
            filename: 'index.html',
            scriptLoading: 'defer'
        }),
        new HtmlWebpackPlugin({
            minify: htmlMinifyOpts,
            template: 'html/index.html',
            filename: '404.html',
            scriptLoading: 'defer'
        }),
        new MiniCssExtractPlugin({
            filename: 'assets/style.[chunkhash].css'
        }),
        new InjectManifest({
            swSrc: './src/service-worker.js',
            swDest: './sw.js',
            exclude: [
                /\.map$/i,
                'robots.txt',
                'sitemap.xml'
            ]
        })
    ],
    resolve: {
        extensions: ['.ts', '.tsx', '.js']
    },
    devtool: "source-map",
    devServer: {
        static: {
            directory: path.join(__dirname, "dist"),
        },
        port: 9000,
        historyApiFallback: true,
    },
    optimization: {
        minimizer: [
            new Terser({}),
            new CssMinimizerPlugin()
        ],
    },
    mode: webpackMode,
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                exclude: excludePattern,
                use: [babelLoader, {loader: 'ts-loader'}]
            },
            {
                test: /\.m?js$/,
                exclude: excludePattern,
                use: [babelLoader]
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
