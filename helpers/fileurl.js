var s3 = require('../helpers/s3');


var env  = process.env.NODE_ENV || 'development';



const {isEmpty, merge} = require('lodash');


const get_file_upload_url = function(path, type, privacy) {
	if (privacy == true) {
		return s3.get_file_upload_private_presigned_url(path, type)	
	} else {
		return s3.get_file_upload_public_presigned_url(path, type)
	}
}
exports.get_file_upload_url = get_file_upload_url;


const get_file_read_url = function(path, type, privacy) {
	if (privacy == true) {
		return s3.get_file_read_private_presigned_url(path, type);
	} else {
		return s3.get_file_read_public_url(path, type)
	}
}
exports.get_file_read_url = get_file_read_url;


exports.product_image_url = function(p) {
	if (p.Image) {
		return get_file_read_url(p.Image.path, p.Image.type, p.Image.is_private);
	}
	else
		return ""
}

exports.template_image_url = function(t) {
	if (t.Image) {
		return get_file_read_url(t.Image.path, t.Image.type, t.Image.is_private);
	}
	else
		return ""
}
exports.user_image_url = function(u) {
	if (u.Image) {
		return get_file_read_url(u.Image.path, u.Image.type, u.Image.is_private);
	}
	else
		return ""
}

exports.app_image_url = function(a) {
	if (a.Image) {
		return get_file_read_url(a.Image.path, a.Image.type, a.Image.is_private);
	}
	else
		return ""
}


exports.product_file_url = function(p) {
	if (p.File) {
		return get_file_read_url(p.File.path, p.File.type, p.File.is_private);
	}
	else
		return ""
}

exports.feature_image_url = function(f) {
	if (f.Image) {
		return get_file_read_url(f.Image.path, f.Image.type, f.Image.is_private);
	}
	else
		return ""
}

exports.feature_video_url = function(f) {
	if (f.Video) {
		return get_file_read_url(f.Video.path, f.Video.type, f.Video.is_private);
	}
	else
		return ""
}
