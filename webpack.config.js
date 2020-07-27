const path = require('path');
const webpack = require('webpack');
module.exports = {
	mode:"development",
	entry: {
		"js/index": './src/index.ts'
	},  
	output: {
		path: path.join(__dirname,'dist'),
		filename: '[name].js'
	},
	resolve: {
		modules: [
			"node_modules",
		],
		extensions:['.ts','.js']
	},
	devServer: {
		contentBase: path.join(__dirname,'dist')
	},
	module: {
		rules: [
			{
				test:/\.ts$/,
				use:'ts-loader'
			}
		]
	},
	plugins: [
		new webpack.ProvidePlugin({
			$:'jquery',
			jQuery:"jquery"
		})
	]
}