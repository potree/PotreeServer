
const log4js = require('log4js');

log4js.configure({
	appenders: {
		out: { 
			type: 'stdout', 
			layout: {
				type: 'pattern',
				pattern: '%[ %d %p %m %]' 
			}},
		app: { 
			type: 'file', 
			filename: `${__dirname}/potree_server.log`, 
			layout: {
				type: 'pattern',
				pattern: '%d %p %m' 
			},
			maxLogSize: 52428800, backups: 5, compress: true
		}
	},
	categories: {
		default: { appenders: [ 'out', 'app' ], level: 'debug' }
	}
});

const logger = log4js.getLogger();


console.originalLog = console.log;
console.log = function(...args){
	logger.info(args.join(" "));
	console.originalLog(...args);
};


console.originalError = console.error;
console.error = function(...args){
	logger.error(args.join(" "));
	console.originalError(...args);
};

exports.logger = logger;