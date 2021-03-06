"use strict";

/*
speed/memory performance  is not important
ease of use is important
 */

/*
this provides data base utility functions to the compiler, at compile time.
 */

//https://github.com/luciotato/waitfor-ES6   //npm install wait.for-es6
//var fb = require("node-firebird");

var db = require("../../server/database/DatabasePool");
//var Sync = require('sync');

var connection = {};
var deepcopy = require('deepcopy');

var parse_error = function (zx, err, source, script) {
	//console.log('\n\n\n\n\n\n\nparse_error a :');
	//process.exit(2);
	//console.log('\n\n\n\n\n\n\nparse_error b :', err.status);
	if (err.status !== undefined) {
		err.status.forEach(function (entry) {
			console.log('error entry:', entry);
		});
	}
	var script_err = {};
	script_err.source_file = "undetermined";
	script_err.source_line = 0;
	script_err.source_col = 0;
	script_err.text = "";

	var a = (err.message.match(/line\ (\d+)/));
	if (a && a.length > 1)
		script_err.line =  + (a[1]);
	a = (err.message.match(/column\ (\d+)/));
	if (a && a.length > 1)
		script_err.col =  + (a[1]);
	script_err.message = err.message;

	if (source === undefined) {
		source = zx.sql.filelinemap[script_err.line];
		//console.log('script_err mapping :',script_err,source,zx.sql.filelinemap.length );
		//console.log('script_err zx.sql.filelinemap :',zx.sql.filelinemap );
	}

	if (source === undefined) {
		script_err.source_file = "undetermined";
		script_err.source_line = 0;
		script_err.source_col = 0;
		script_err.text = "";

	} else {
		var src,
		srcx;

		if (source.src_obj)
			srcx = source.src_obj.srcinfo;
		else
			srcx = source.srcinfo;

		var src = deepcopy(srcx);
		if (src.source && src.source.length > 200)
			src.source = zx.show_longstring(src.source);
		console.log('script_err source:', src); //,source );

		script_err.source_file = src.filename;
		script_err.source_line = src.start_line + script_err.line;
		if (source.src_obj)
			script_err.source_line += source.LineNr;

		script_err.source_col = script_err.col;
		script_err.text = src.source;
		if (script !== undefined)
			script_err.context = script.substr(script_err.col - 10, 20);
		console.log('script_err source err:', script_err);
	}

	zx.err = script_err;

	return script_err;

};

exports.databaseUtils = function (root_folder, connectionID, url, callback) {
	connection.ready = false;
	if (connection.db === undefined) { //read the config from  a file in the application folder
		//console.log('attach:',connectionID,url );

		db.databasePooled(root_folder, connectionID, url,
			function (err, msg, rambase) {
			if (err) {

				console.log("error connecting on ", err);

				console.log(err.message);
				if (callback !== undefined)
					callback(err, "Error");
			} else {
				connection.db = rambase.db;
				connection.rambase = rambase;
				//console.log("connected on " + connection, ' rambase: ',connection.rambase);
				connection.ready = true;
				if (callback !== undefined)
					callback(null, "Connected", connection.rambase);
			}
		});
		//connection.db=rambase.db;
		//connection.ready=true;

	} else
		callback(null, "Connected", connection.rambase);

};

exports.getquery_info = function (zx, name, script, line_obj, return_callback) { //from  node_modules\node-firebird\test\test.js
	//useful : http://www.alberton.info/firebird_sql_meta_info.html#.VFE8QmckQhU
	var tr,
	ret,
	st;
	function error(/*err*/
	) {
		if (tr)
			tr.rollback();
		if (st)
			st.drop();
		//console.log('=====error:',err);
	}

	script = script.replace(/operator.ref/gi, "?");
	script = script.replace(new RegExp('operator.'+zx.conf.db.platform_user_table.user_pk_field ,'gi'), "?"); 
	// console.log('prepareingStatement:',script );

	connection.db.startTransaction(
		function (err, transaction) {
		if (err) {
			error(err);
			var source = {}; //filename,start_line,start_col,source};
			parse_error(zx, err, source, line_obj);
			console.log('Error starting transaction:', err);
			return;
		}
		tr = transaction;
		transaction.newStatement(script,
			function (err, statement) {
			if (err) {
				error(err);
				var script_err = parse_error(zx, err, line_obj, script);
				script_err.query = script;
				//console.log('=====script:',script);
				//console.log('=====script:',zx.err);
				ret = {
					status : "err",
					err : err
				};
				zx.error.write_getquery(zx, zx.err);
				//throw new Error("getquery error.")
				return_callback(null, ret);
				//return
			} else {
				st = statement;
				ret = {
					status : "done",
					output : statement.output,
					input : statement.input
				};
				//console.log("statement output:",statement.output);
				//console.log("statement input:",statement.input);
				statement.drop();
				return_callback(null, ret);
			}
		});
	});

};

exports.validate_script = function (zx, name, script, callback) {

	var querys = 'EXECUTE BLOCK RETURNS  (info varchar(200),res blob SUB_TYPE 1)AS declare pki integer=0;declare pkf integer=0;declare z$sessionid varchar(40)=\'\';' + script;
	connection.db.query(querys, [],
		function (err, result) {
		//console.log('validation result: write',err,result );
		if (!result || result.length === 0) {
			//parse the error
			var script_err = parse_error(zx, err);
			zx.err = script_err;
			//todo - show operator some kind of server error
			callback(null, script_err);
		} else {
			console.log('script_ok:'); //,result );
			callback(null, "ok");
		}

	});

};

exports.dataset = function (cx, name, script, line_obj, callback) {
	var querys = script;
	connection.db.query(querys, [],
		function (err, result) {
		//console.log('validation result: write',err,result );
		if (err) {
			//parse the error
			var script_err = parse_error(cx.zx, err);
			cx.zx.err = script_err;
			//todo - show operator some kind of server error
			callback(null, script_err);
		} else {
			//console.log('dataset result:', result);
			callback(null, result);
		}

	});

};

exports.exec_qry_cb = function (cx, name, script, line_obj, callback) {

	var qrystr = script;
	connection.db.execute(qrystr, [],
		function (err, result) {
		//console.log('validation result: write',err,result );
		//if (verbosity>5)
		//   console.log(" Executed without error, from line:", Lastddlcount,' lines:',DDLLen,'text:',qrystr);

		if (err) {
			//parse the error
			var script_err = JSON.stringify(err);

			if (cx.expect !== undefined && cx.expect.test(script_err)) {
				//console.log('Acceptable error:', cx.expect,qrystr);
			} else {
				console.log('script_err:', script_err, err, ' in :------------------>\n', script);
				script_err = parse_error(cx.zx, err, line_obj);
				cx.zx.err = script_err;
				throw new Error("update script error.", script_err + '/n' + script);
				//todo - show operator some            kind of server error
			}
			callback(null, script_err);
		} else {
			//console.log('exec_qry_cb result:', result,qrystr);
			callback(null, result);
		}

	});

};

exports.write_script = function (zx, name, script, callback) {
    name = name.replace(/\\/g, '/'); //windows
	connection.db.query('UPDATE OR INSERT INTO Z$SP (FILE_NAME, SCRIPT)VALUES (?,?) MATCHING (FILE_NAME)', [name, script],
		function (err, result) {
		//console.log('dbresult: write' );
		callback(null, err, result);
	});

};

var SQL_TEXT = 452, // Array of char
SQL_VARYING = 448,
SQL_SHORT = 500,
SQL_LONG = 496,
SQL_FLOAT = 482,
SQL_DOUBLE = 480,
SQL_D_FLOAT = 530,
SQL_TIMESTAMP = 510,
SQL_BLOB = 520,
SQL_ARRAY = 540,
SQL_QUAD = 550,
SQL_TYPE_TIME = 560,
SQL_TYPE_DATE = 570,
SQL_INT64 = 580,
SQL_BOOLEAN = 32764, // >= 3.0
SQL_NULL = 32766; // >= 2.5

exports.get_meta_info = function (meta) {
	var info;

	var div = Math.pow(10, -meta.scale);

	if (meta.type === SQL_NULL) {
		info = {
			base_type : 'Text',
			strlen : 20
		};
	}
	if (meta.type === SQL_TEXT) {
		info = {
			base_type : 'Text',
			strlen : meta.length
		};
	}
	if (meta.type === SQL_VARYING) {
		info = {
			base_type : 'Text',
			strlen : meta.length
		};
	}
	if (meta.type === SQL_BLOB) {
		info = {
			base_type : 'Text',
			strlen : meta.length
		};
	}

	if (meta.type === SQL_TIMESTAMP) {
		info = {
			base_type : 'Text',
			strlen : 20,
			codec : 'stamp'
		};
	}
	if (meta.type === SQL_TYPE_TIME) {
		info = {
			base_type : 'Text',
			strlen : 10,
			codec : 'time'
		};
	}
	if (meta.type === SQL_TYPE_DATE) {
		info = {
			base_type : 'Text',
			strlen : 10,
			codec : 'date'
		};
	}

	if (meta.type === SQL_BOOLEAN) {
		info = {
			base_type : 'Int',
			allow : ['0', '1', 'false', 'true', 'yes', 'no'],
			pick : 'noyes',
			codec : 'bool'
		};
	}
	if (meta.type === SQL_SHORT) {
		info = {
			base_type : 'Int',
			range : [-32767, 32767]
		};
	}
	if (meta.type === SQL_LONG) {
		if (meta.scale === 0)
			info = {
				base_type : 'Int',
				range : [-2147483648, 2147483647]
			};
		else {
			//todo test this code - it is likely incorrect
			info = {
				base_type : 'Num',
				range : [-2147483648 / div, 2147483647 / div],
				places : -meta.scale
			};
		}
	}
	if (meta.type === SQL_INT64) {
		info = {
			base_type : 'Int',
			range : [-9223372036854775808, 9223372036854775807]
		};
	}
	if (meta.type === SQL_QUAD) {
		info = {
			base_type : 'Int',
			range : [-9223372036854775808, 9223372036854775807]
		};
	}

	if (meta.type === SQL_FLOAT) {
		//todo test this code - it is likely incorrect
		info = {
			base_type : 'Num',
			range : [-9223372036854775808 / div, 9223372036854775807 / div],
			places : -meta.scale
		};
	}
	if (meta.type === SQL_DOUBLE) {
		//todo test this code - it is likely incorrect
		info = {
			base_type : 'Num',
			range : [-9223372036854775808 / div, 9223372036854775807 / div],
			places : -meta.scale
		};
	}
	if (meta.type === SQL_D_FLOAT) {
		//todo test this code - it is likely incorrect
		info = {
			base_type : 'Num',
			range : [-9223372036854775808 / div, 9223372036854775807 / div],
			places : -meta.scale
		};
	}

	if (meta.type === SQL_ARRAY) {
		//todo test this code - it is likely incorrect
		info = {
			base_type : 'Text',
			strlen : meta.length,
			codec : 'csv'
		};
	}

	return info;
};

var spawn = require('child_process').spawn;
exports.extract_dll = function (zx, callback) {
	//console.log('extract_dll :',connection.rambase.isql_extract_dll_cmdln);
	//isql-fb -ex -o ddlx.sql -user SYSDBA -password pickFb2.5 192.168.122.1:db31


	var output = [];

	if (zx.config.windows) {

		callback(null, {
			err : 2,
			ddl : ""
		});
	} else {
		var command = spawn('/usr/bin/isql-fb', connection.rambase.isql_extract_dll_cmdln);
		command.stdout.on('data', function (chunk) {
			output.push(chunk);
		});

		command.on('close', function (code) {
			if (code === 0) {
				var str = output.join('');
				//  console.log('sddl_backup result :', str);
				callback(null, {
					err : code,
					ddl : str
				});
			} else {
				console.log('extract_dll failed :', code);
				callback(null, {
					err : code,
					ddl : ""
				});
			}

		});
	}

};

exports.exit = function (/*zx*/
) {
	connection.db.detach(
		function () {
		console.log('database detached');
	});
};

exports.init = function (/*zx*/
) {
	//each type of database generator would be different ,//including noSQL
	//console.log('init db_access.fb.sql: ');


};
