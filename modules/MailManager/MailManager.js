/*+**********************************************************************************
 * The contents of this file are subject to the vtiger CRM Public License Version 1.1
 * ("License"); You may not use this file except in compliance with the License
 * The Original Code is:  vtiger CRM Open Source
 * The Initial Developer of the Original Code is vtiger.
 * Portions created by vtiger are Copyright (C) vtiger.
 * All Rights Reserved.
 ************************************************************************************/
if (typeof(MailManager) == 'undefined') {
	if (typeof(Dropzone) != 'undefined') {
		// Disable auto discover for all elements:
		Dropzone.autoDiscover = false;
	}

	/*
	 * Namespaced javascript class for MailManager
	 */
	MailManager = {

		MailManagerUploadLimit : 6,

		/*
	 * Utility function
	 * Usage:
	 * var output = MailManager.sprintf("String format %s, Number format %s", "VALUE", 10);
	 */
		sprintf: function () {
			var printString = arguments[0];
			for (var i = 1; i < arguments.length; ++i) {
				// Replace any %s, %d, %c with the variables.
				// TODO Format the argument w.r.t to format specifier
				printString = printString.replace(/(%[a-z]+)/, arguments[i]);
			}
			return printString;
		},

		/*
	 * Progress indicator handlers.
	 */
		progress_show: function (msg, suffix) {
			if (typeof(suffix) == 'undefined') {
				suffix = '';
			}
			VtigerJS_DialogBox.block();
			if (typeof(msg) != 'undefined') {
				jQuery('#_progressmsg_').html(msg + suffix.toString());
			}
			jQuery('#_progress_').show();
		},
		progress_hide: function () {
			VtigerJS_DialogBox.unblock();
			jQuery('#_progressmsg_').html('');
			jQuery('#_progress_').hide();
		},

		/* Show error message */
		show_error: function (message) {
			ldsModal.show(alert_arr['ERROR'], DOMPurify.sanitize(message), 'small', '');
		},

		hide_error: function () {
			setTimeout(function () {
				ldsModal.close();
			}, 5000);
		},

		show_message: function (message) {
			ldsModal.show('', DOMPurify.sanitize(message), 'small', '');
			MailManager.hide_error();
		},

		/* Base url for any ajax actions */
		_baseurl: function () {
			return 'module=MailManager&action=MailManagerAjax&file=index&mode=ajax&';
		},

		/* Translation support */
		i18n: function (key) {
			if (typeof(MailManageri18nInfo) != 'undefined') {
				return MailManageri18nInfo[key];
			}
			if (typeof(alert_arr) != 'undefined' && alert_arr[key]) {
				return alert_arr[key];
			}
			return key;
		},

		/* Build the main ui */
		mainui: function () {
			MailManager.openCurrentFolder();
			setTimeout(function () {
				jQuery('#_folderprogress_').show();
				MailManager.mail_open_meta = {};
				if (MailManager.mail_reply_rteinstance) {
					MailManager.mail_reply_rteinstance.destroy();
					MailManager.mail_reply_rteinstance = false;
				}
				MailManager.progress_show(MailManager.i18n('JSLBL_Loading_Please_Wait'), '...');
				jQuery.ajax({
					method: 'POST',
					url: 'index.php?'+MailManager._baseurl() + '_operation=mainui'
				}).done(function (transport) {
					var response = MailManager.removeHidElement(transport);
					response = JSON.parse(response);
					MailManager._mainui_callback(response);
					jQuery('#_folderprogress_').hide();
					var timeOut = jQuery('#refresh_timeout').val();
					if (timeOut != '' && timeOut !=0) {
						setInterval(MailManager.updateMailFolders, timeOut);
					}
					// Update the seleted folders to highlight them.
					var folderName = jQuery('#mm_selected_folder').val();
					MailManager.updateSelectedFolder(folderName);
				});
			}, 400);
		},

		openCurrentFolder : function () {
			if (jQuery('#mailbox_folder').length) {
				var currentFolder = jQuery('#mailbox_folder').val();
				// This is added as we will be settings mailbox_folder with the current selected folder.
				// By this time we would have lost the last mailbox folder also
				if (currentFolder == 'mm_drafts') {
					currentFolder = 'INBOX';
				}

				if (currentFolder) {
					MailManager.folder_open(currentFolder);
				} else {
					MailManager.folder_open('INBOX');
				}
			} else {
				MailManager.folder_open('INBOX');
			}
		},

		updateMailFolders : function () {
			jQuery.ajax({
				method: 'POST',
				url: 'index.php?'+MailManager._baseurl() + '_operation=mainui'
			}).done(function (transport) {
				var response = MailManager.removeHidElement(transport);
				response = JSON.parse(response);
				jQuery('#_mainfolderdiv_').html(response['result']['ui']);
				MailManager.refreshCurrentFolder(); // this is used to refresh the mails in the folders

				var folderName = jQuery('#mm_selected_folder').val();
				MailManager.updateSelectedFolder(folderName);
			});
		},

		quicklinks_update: function () {
			jQuery.ajax({
				method: 'POST',
				url: 'index.php?'+ MailManager._baseurl() + '_operation=mainui&_operationarg=_quicklinks'
			}).done(function (transport) {
				var response = MailManager.removeHidElement(transport);
				response = JSON.parse(response);
				jQuery('#_quicklinks_mainuidiv_').html(response['result']['ui']);
			});
		},

		/* Intermedidate call back to build main ui */
		_mainui_callback: function (responseJSON) {
			MailManager.progress_hide();
			jQuery('#_mainfolderdiv_').html(responseJSON['result']['ui']);

			if (!responseJSON['result']['mailbox']) {
				MailManager.open_settings();
			}
		},

		moveMail : function (element) {

			function execute() {
				var temp = new Array();

				function getCheckedMails() {
					var cb_elements = jQuery('[name="mc_box"]');

					for (var i = 0; i < cb_elements.length; i++) {
						if (cb_elements[i].checked) {
							temp.push(cb_elements[i].value);
						}
					}
				}

				function validate() {
					getCheckedMails();	// Check the selected mails
					if (temp.length < 1) {
						MailManager.show_error(MailManager.i18n('JSLBL_PLEASE_SELECT_ATLEAST_ONE_MAIL'));
						MailManager.resetFolderDropDown();
						return false;
					}
					return true;
				}

				function callbackFunction(response) {
					for (var i = 0; i<temp.length; i++) {
						jQuery('#_mailrow_'+temp[i]).fadeOut(1500, function () {
							jQuery('#_mailrow_'+temp[i]).remove();
						});
					}
				}

				if (validate()) {
					MailManager.progress_show(MailManager.i18n('JSLBL_MOVING'), '...');
					VtigerJS_DialogBox.block();
					var moveToFolderName = jQuery('#moveFolderList').val();
					var currentFolderName = jQuery('#mailbox_folder').val();
					var params = {
						'_operation': 'mail',
						'_operationarg' : 'move',
						'_msgno' : encodeURIComponent(temp),
						'_folder' : encodeURIComponent(currentFolderName),
						'_moveFolder' : moveToFolderName.replace('�', '')
					};
					MailManager.Request('index.php?'+MailManager._baseurl(), params, callbackFunction).
						then(function () {
							MailManager.folder_open(currentFolderName);
							MailManager.progress_hide();
							MailManager.show_error(MailManager.i18n('JSLBL_MAIL_MOVED'));
						});
				}
			}
			execute();
		},

		/* Refresh the main ui */
		reload_now: function () {
			MailManager.mainui();
		},

		/* Close all the div */
		close_all: function () {
			if (jQuery('#_contentdiv_')) {
				jQuery('#_contentdiv_').hide();
			}
			if (jQuery('#_contentdiv2_')) {
				jQuery('#_contentdiv2_').hide();
			}
			if (jQuery('#_settingsdiv_')) {
				jQuery('#_settingsdiv_').hide();
			}
			if (jQuery('#_replydiv_')) {
				jQuery('#_replydiv_').hide();
			}
		},

		/* Open settings page */
		open_settings: function () {
			MailManager.progress_show(MailManager.i18n('JSLBL_Settings')+ '...');
			jQuery.ajax({
				method: 'POST',
				url: 'index.php?'+MailManager._baseurl() + '_operation=settings&_operationarg=edit'
			}).done(function (transport) {
				MailManager.progress_hide();

				MailManager.close_all();
				jQuery('#_settingsdiv_').show();
				var response = MailManager.removeHidElement(transport);
				jQuery('#_settingsdiv_').html(response);

				// Update the seleted folders to highlight them.
				MailManager.updateSelectedFolder('mm_settings');
				jQuery('#mm_selected_folder').val('mm_settings');
			});
		},

		handle_settings_confighelper: function (selectBox) {
			var form = selectBox.form;

			var useServer = '', useProtocol = '', useSSLType = '', useCert = '';
			if (selectBox.value == 'gmail' || selectBox.value == 'yahoo') {
				useServer = 'imap.gmail.com';
				if (selectBox.value == 'yahoo') {
					useServer = 'imap.mail.yahoo.com';
				}
				useProtocol = 'IMAP4';
				useSSLType = 'ssl';
				useCert = 'novalidate-cert';
				jQuery('#settings_details').show();
				jQuery('#additional_settings').hide();
			} else if (selectBox.value == 'fastmail') {
				useServer = 'mail.messagingengine.com';
				useProtocol = 'IMAP2';
				useSSLType = 'tls';
				useCert = 'novalidate-cert';
				jQuery('#settings_details').show();
				jQuery('#additional_settings').hide();
			} else if (selectBox.value == 'other') {
				useServer = '';
				useProtocol = 'IMAP4';
				useSSLType = 'ssl';
				useCert = 'novalidate-cert';
				jQuery('#settings_details').show();
				jQuery('#additional_settings').show();
			} else {
				jQuery('#settings_details').hide();
			}
			// Clear the User Name and Password field
			jQuery('#_mbox_user').val('');
			jQuery('#_mbox_pwd').val('');

			if (useProtocol != '') {
				form._mbox_server.value = useServer;
				jQuery('input[name="_mbox_protocol"]').each(function () {
					this.checked = (this.value == useProtocol);
				});
				jQuery('input[name="_mbox_ssltype"]').each(function () {
					this.checked = (this.value == useSSLType);
				});
				jQuery('input[name="_mbox_certvalidate"]').each(function () {
					this.checked = (this.value == useCert);
				});
			}
		},

		/* Save the settings */
		save_settings: function (form) {
			if (form._mbox_server.value == '') {
				MailManager.show_error(MailManager.i18n('JSLBL_SERVERNAME_CANNOT_BE_EMPTY'));
				return false;
			}
			if (form._mbox_user.value == '') {
				MailManager.show_error(MailManager.i18n('JSLBL_USERNAME_CANNOT_BE_EMPTY'));
				return false;
			}
			if (form._mbox_pwd.value == '') {
				MailManager.show_error(MailManager.i18n('JSLBL_PASSWORD_CANNOT_BE_EMPTY'));
				return false;
			}
			MailManager.progress_show(MailManager.i18n('JSLBL_Saving_And_Verifying'), '...');
			jQuery.ajax({
				method: 'POST',
				url: 'index.php?'+MailManager._baseurl() + '_operation=settings&_operationarg=save&' + jQuery(form).serialize()
			}).done(function (transport) {
				MailManager.progress_hide();
				var response = MailManager.removeHidElement(transport);
				var responseJSON = JSON.parse(response);
				if (responseJSON['success']) {
					MailManager.quicklinks_update();
					MailManager.folder_open('INBOX');
					MailManager.mainui();
				} else {
					MailManager.show_error(responseJSON['error']['message']);
				}
			});
		},

		/* Remove the settings */
		remove_settings: function (form) {
			MailManager.progress_show(MailManager.i18n('JSLBL_Removing'), '...');
			jQuery.ajax({
				method: 'POST',
				url: 'index.php?'+MailManager._baseurl() + '_operation=settings&_operationarg=remove&' + jQuery(form).serialize()
			}).done(function (transport) {
				MailManager.progress_hide();
				MailManager.close_all();
				var response = MailManager.removeHidElement(transport);
				var responseJSON = JSON.parse(response);
				if (responseJSON['success']) {
					MailManager.reload_now();
				} else {
					MailManager.show_error(responseJSON['error']['message']);
				}
			});
		},

		/* Close the settings */
		close_settings: function () {
			MailManager.close_all();
			jQuery('#_contentdiv_').show();

			// Toggle highlighting previous folder and current folder selection
			var folderName = jQuery('#mailbox_folder').val();
			MailManager.updateSelectedFolder(folderName);
			jQuery('#mm_selected_folder').val(folderName);
		},

		/* Open the folder listing */
		folder_open: function (name, page) {
			if (typeof(page) == 'undefined') {
				page = 0;
			}

			var query = '';
			// Consider search string too
			if (jQuery('#search_txt').val()) {
				query = '&q=' +encodeURIComponent(jQuery('#search_txt').val());
			}
			if (jQuery('#search_type').val()) {
				query += '&type=' + encodeURIComponent(jQuery('#search_type').val());
			}
			MailManager.progress_show(MailManager.i18n('JSLBL_Loading'), ' ' + name + '...');

			jQuery.ajax({
				method: 'POST',
				url: 'index.php?'+MailManager._baseurl() + '_operation=folder&_operationarg=open&_folder=' + encodeURIComponent(name)  +
				'&_page=' + encodeURIComponent(page) + query
			}).done(function (transport) {
				MailManager.progress_hide();

				// Toggle highlighting previous folder and current folder selection
				MailManager.updateSelectedFolder(name);

				// Update the selected MailBox folder name
				jQuery('#mailbox_folder').val(name);

				// Update the current selected folder, which will be used to highlight the selected folder
				jQuery('#mm_selected_folder').val(name);

				MailManager.mail_close();
				var response = MailManager.removeHidElement(transport);
				jQuery('#_contentdiv_').html(response);

				// Clear last open mail
				jQuery('#_contentdiv2_').html('');

				// Updates the drop down used for move emails
				MailManager.updateMoveFolderList();

				// Bind "Enter" key for search on the Search text box
				MailManager.bindEnterKeyForSearch();
			});
		},

		updateSelectedFolder : function (currentSelectedFolder) {
			var prevFolderName = jQuery('#mm_selected_folder').val();
			if (jQuery('[id="_mailfolder_' + prevFolderName +'"]') && prevFolderName != currentSelectedFolder) {
				jQuery('[id="_mailfolder_' + prevFolderName +'"]').removeClass('mm_folder_selected');
				jQuery('[id="_mailfolder_' + prevFolderName +'"]').parent().removeClass('mm_folder_selected_background');
			}
			jQuery('[id="_mailfolder_'+ currentSelectedFolder +'"]').addClass('mm_folder_selected');
			jQuery('[id="_mailfolder_'+ currentSelectedFolder +'"]').parent().addClass('mm_folder_selected_background');
		},

		bindEnterKeyForSearch : function () {
			jQuery('#search_txt').keyup(function (event) {
				if (event.keyCode == 13) {
					jQuery('#mm_search').click();
				}
			});
		},

		updateMoveFolderList : function () {
			if (jQuery('#mailbox_folder').length && jQuery('#moveFolderList').length) {
				var currentFolder = jQuery('#mailbox_folder').val();
				jQuery('#moveFolderList').find('option[value=\''+currentFolder+'\']').remove();
			}
		},

		refreshCurrentFolder: function () {
			var selectedFolder = jQuery('#mm_selected_folder').val();
			var currentFolderName = jQuery('#mailbox_folder').val();

			//check if the mail is open
			var mail = jQuery('#_contentdiv2_').css('display');
			if (selectedFolder == currentFolderName && currentFolderName !='mm_drafts' && mail != 'block') {
				MailManager.folder_open(currentFolderName, 0);
			}
		},

		/* Update count of unread mails on folder */
		folder_updateCount: function (folder, count) {
			if (jQuery('#_mailfolder_' + folder)) {
				if (count) {
					jQuery('#_mailfolder_' + folder).addClass('mm_folder_selected').html(MailManager.sprintf('<b>%s (%s)</b>', folder, count));
				} else {
					jQuery('#_mailfolder_' + folder).addClass('mm_folder_selected').html(MailManager.sprintf('%s', folder));
				}
			}
		},

		/* Basic search for folder emails */
		search_basic: function (form) {
			var frmparams = jQuery(form).serialize();

			MailManager.progress_show(MailManager.i18n('JSLBL_Searching'), ' ...');

			jQuery.ajax({
				method: 'POST',
				url: 'index.php?'+MailManager._baseurl() + '_operation=folder&_operationarg=open&' + frmparams
			}).done(function (transport) {
				MailManager.progress_hide();

				MailManager.mail_close();
				var response = MailManager.removeHidElement(transport);
				jQuery('#_contentdiv_').html(response);
			});
			return false;
		},

		// Meta information of currently opened mail
		mail_open_meta: {},

		/* Open email */
		mail_open: function (folder, msgno) {
			MailManager.progress_show(MailManager.i18n('JSLBL_Opening'), ' ...');

			jQuery('#_mailrow_' + msgno).removeClass('mm_bold');
			jQuery('#_mailrow_' + msgno).addClass('mm_normal');

			jQuery.ajax({
				method: 'POST',
				url: 'index.php?'+MailManager._baseurl() + '_operation=mail&_operationarg=open&_folder=' + encodeURIComponent(folder) + '&_msgno=' + encodeURIComponent(msgno)
			}).done(function (transport) {
				MailManager.progress_hide();
				var response = MailManager.removeHidElement(transport);
				var responseJSON = JSON.parse(response);
				var resultJSON = responseJSON['result'];

				if (!resultJSON['ui']) {
					MailManager.show_error(MailManager.i18n('JSLBL_Failed_To_Open_Email'));
					return;
				}

				MailManager.close_all();
				jQuery('#_contentdiv2_').show();
				jQuery('#_contentdiv2_').html(resultJSON['ui']);

				MailManager.mail_open_meta = resultJSON['meta'];
				var folderName = resultJSON['folder'];

				// Update folder count on UI
				MailManager.folder_updateCount(folderName, resultJSON['unread']);

				MailManager.mail_find_relationship();
			});
		},

		/* Close email */
		mail_close: function () {
			MailManager.close_all();
			jQuery('#_contentdiv_').show();
			MailManager.mail_open_meta = {};
		},

		/* Mark mail as read */
		mail_mark_unread: function (folder, msgno) {
			MailManager.progress_show(MailManager.i18n('JSLBL_Updating'), ' ...');
			jQuery.ajax({
				method: 'POST',
				url: 'index.php?'+MailManager._baseurl() + '_operation=mail&_operationarg=mark&_markas=unread&_folder=' + encodeURIComponent(folder) + '&_msgno=' + encodeURIComponent(msgno)
			}).done(function (transport) {
				MailManager.progress_hide();
				var response = MailManager.removeHidElement(transport);
				var responseJSON = JSON.parse(response);
				var resultJSON = responseJSON['result'];

				if (responseJSON && resultJSON['status']) {
					MailManager.mail_close();

					var msgno = resultJSON['msgno'];
					jQuery('#_mailrow_' + msgno).removeClass('mm_normal');
					jQuery('#_mailrow_' + msgno).addClass('mm_bold');

					MailManager.folder_updateCount(resultJSON['folder'], resultJSON['unread']);
				}
			});
		},

		/* Lookup for mail relations in CRM */
		mail_find_relationship: function () {
			jQuery('#_mailrecord_findrel_btn_').html(MailManager.i18n('JSLBL_Finding_Relation') + '...');
			jQuery('#_mailrecord_findrel_btn_').prop('disabled', true);

			var meta = MailManager.mail_open_meta;

			jQuery.ajax({
				method: 'POST',
				url: 'index.php?'+MailManager._baseurl() + '_operation=relation&_operationarg=find&_mfrom=' + encodeURIComponent(meta['from']) +
					'&_folder=' + encodeURIComponent(meta['folder']) + '&_msgno=' + encodeURIComponent(meta['msgno']) + '&_msguid=' +
					encodeURIComponent(meta['msguid'].replace('<', '&lt;').replace('>', '&gt;'))
			}).done(function (transport) {
				jQuery('#_mailrecord_findrel_btn_').html(MailManager.i18n('JSLBL_Find_Relation_Now'));
				jQuery('#_mailrecord_findrel_btn_').prop('disabled', false);
				jQuery('#_mailrecord_findrel_btn_').hide();
				var response = MailManager.removeHidElement(transport);
				var responseJSON = JSON.parse(response);
				var resultJSON = responseJSON['result'];

				jQuery('#_mailrecord_relationshipdiv_').html(resultJSON['ui']);
			});
		},

		/* Associate email to CRM record */
		mail_associate: function (form) {
			var frmparams = jQuery(form).serialize();
			// No record is selected for linking?
			if (frmparams.indexOf('_mlinkto') == -1) {
				return;
			}

			MailManager.progress_show(MailManager.i18n('JSLBL_Associating'), ' ...');
			jQuery.ajax({
				method: 'POST',
				url: 'index.php?'+MailManager._baseurl() + '_operation=relation&_operationarg=link&' + frmparams
			}).done(function (transport) {
				MailManager.progress_hide();
				var response = MailManager.removeHidElement(transport);
				var responseJSON = JSON.parse(response);
				var resultJSON = responseJSON['result'];
				if (resultJSON['ui']) {
					jQuery('#_mailrecord_relationshipdiv_').html(resultJSON['ui']);
				}
			});
		},

		/* Extended support for creating and linking */
		mail_associate_create_wizard: function (form) {
			if (form._mlinktotype.value == '') {
				MailManager.mail_associate_create_cancel();
				return;
			}
			var frmparams = jQuery(form).serialize();
			MailManager.progress_show(MailManager.i18n('JSLBL_Loading'), ' ...');
			jQuery.ajax({
				method: 'POST',
				url: 'index.php?'+ MailManager._baseurl() + '_operation=relation&_operationarg=create_wizard&' + frmparams
			}).done(function (transport) {
				MailManager.progress_hide();
				var response = MailManager.removeHidElement(transport);
				jQuery('#_relationpopupdiv_').get(0).innerHTML = (response);
				vtlib_executeJavascriptInElement(document.getElementById('_relationpopupdiv_'));
				// Place the popup at center
				MailManager.placeAtCenter(jQuery('#_relationpopupdiv_'));
				jQuery('#_relationpopupdiv_').css('visibility', '').show();

				//Make it Dragable
				jQuery('#_relationpopupdiv_').draggable().css('cursor', 'move');
			});
		},

		/* This will be used to perform actions on mails with an Linked record */
		mail_associate_actions : function (form) {
			var selected = false;
			if (form._mlinkto.length != undefined) {
				for (var i=0; i<form._mlinkto.length; i++) {
					if (form._mlinkto[i].checked) {
						selected = true;
					}
				}
			} else {
				if (form._mlinkto && form._mlinkto.checked) {
					selected = true;
				} else {
					form._mlinkto.checked = true;
					selected = true;
				}
			}

			// No record is selected for linking?
			if (!selected) {
				MailManager.show_error(MailManager.i18n('JSLBL_PLEASE_SELECT_ATLEAST_ONE_RECORD'));
				MailManager.resetLinkToDropDown();
				return false;
			}

			if (form._mlinktotype.value == 'Emails') {
				MailManager.mail_associate(form);
			} else if (form._mlinktotype.value == 'ModComments') {
				MailManager.showCommentWidget(form);
			} else {
				MailManager.mail_associate_create_wizard(form);
			}
		},

		mail_associate_create_cancel: function () {
			jQuery('#_relationpopupdiv_').hide();
			MailManager.resetLinkToDropDown();
		},

		mail_associate_create: function (form) {

			//this is needed as there will be additional module & action element in quickcreate form
			jQuery('form[name=\'QcEditView\']').children('input[name=\'module\']').remove();
			jQuery('form[name=\'QcEditView\']').children('input[name=\'action\']').remove();

			var frmparams = jQuery(form).serialize();
			MailManager.progress_show(MailManager.i18n('JSLBL_Associating'), ' ...');
			jQuery.ajax({
				method: 'POST',
				url: 'index.php?'+ MailManager._baseurl() + '_operation=relation&_operationarg=create&' + frmparams
			}).done(function (transport) {
				MailManager.progress_hide();
				var response = MailManager.removeHidElement(transport);
				var responseJSON = JSON.parse(response);
				var resultJSON = responseJSON['result'];
				if (resultJSON['ui']) {
					MailManager.mail_associate_create_cancel();
					jQuery('#_mailrecord_relationshipdiv_').html(resultJSON['ui']);
					return true;
				}
			});
		},

		// function to show the comment widget
		showCommentWidget : function (form) {
			var frmparams = jQuery(form).serialize();
			MailManager.progress_show();
			jQuery.ajax({
				method: 'POST',
				url: 'index.php?'+ MailManager._baseurl() + '_operation=relation&_operationarg=commentwidget&' + frmparams
			}).done(function (transport) {
				MailManager.progress_hide();
				var response = MailManager.removeHidElement(transport);
				MailManager.mail_associate_create_cancel();
				jQuery('#_relationpopupdiv_').html(response).css('visibility', '').show();
				// Place the popup at the center
				MailManager.placeAtCenter(jQuery('#_relationpopupdiv_'));
				// Make it draggable
				jQuery('#_relationpopupdiv_').draggable().css('cursor', 'move');
			});
		},

		addCommentValidate : function (form) {
			var comment = jQuery.trim(jQuery(form.commentcontent).val());
			if (comment == '') {
				MailManager.show_error(MailManager.i18n('JSLBL_CANNOT_ADD_EMPTY_COMMENT'));
				return false;
			}
			return true;
		},

		// Place an element at the center of the page
		placeAtCenter : function (element) {
			element.css('position', 'absolute');
			element.css('top', ((jQuery(window).height() - element.outerHeight()) / 2) + jQuery(window).scrollTop() + 'px');
			element.css('left', ((jQuery(window).width() - element.outerWidth()) / 2) + jQuery(window).scrollLeft() + 'px');
		},

		/* Compose new mail */
		mail_compose: function () {
			MailManager.close_all();
			jQuery('#_replydiv_').html(jQuery('#replycontentdiv').html());
			jQuery('#_replydiv_').show();

			jQuery('#_mail_replyfrm_to_').val('');
			jQuery('#_mail_replyfrm_cc_').val('');
			jQuery('#_mail_replyfrm_bcc_').val('');
			jQuery('#_mail_replyfrm_subject_').val('');
			jQuery('#emailid').val('');
			jQuery('#attachments').children().remove();
			jQuery('#attachmentCount').val('');
			if (MailManager.mail_reply_rteinstance) {
				delete CKEDITOR.instances['_mail_replyfrm_body_'];
				MailManager.mail_reply_rteinstance = false;
			}
			MailManager.mail_reply_rteinit('');
			var dzelem = jQuery('#file-uploader');
			if (dzelem.dropzone && dzelem[0].dropzone != undefined) {
				dzelem[0].dropzone.removeAllFiles();
			} else {
				var dz = MailManager.createUploader();
			}

			// Update the seleted folders to highlight them.
			MailManager.updateSelectedFolder('mm_compose');
			jQuery('#mm_selected_folder').val('mm_compose');
			// Get User Default template
			GlobalVariable_getVariable('Users_Default_Send_Email_Template', '', 'Emails', gVTUserID).then(function (response) {
				var emltpl = JSON.parse(response);
				if (emltpl.Users_Default_Send_Email_Template!='') {
					var baseurl = 'module=Utilities&action=UtilitiesAjax&file=ExecuteFunctions&functiontocall=getEmailTemplateDetails&templateid=';
					jQuery.ajax({
						method: 'POST',
						url: 'index.php?'+baseurl + encodeURIComponent(emltpl.Users_Default_Send_Email_Template)
					}).done(function (resp) {
						emltpl = JSON.parse(resp);
						document.getElementById('_mail_replyfrm_subject_').value = emltpl.subject;
						document.getElementById('_mail_replyfrm_body_').value = emltpl.body + emailSignature;
						MailManager.mail_reply_rteinit(emltpl.body);
					});
				} else {
					document.getElementById('_mail_replyfrm_body_').value = '<p></p>' + emailSignature;
					MailManager.mail_reply_rteinit(emltpl.body);
				}
			});
		},

		createUploader : function () {
			var uploader = new Dropzone('#file-uploader', {
				url : function () {
					return 'index.php?module=MailManager&action=MailManagerAjax&file=index&mode=ajax&_operation=relation&_operationarg=saveattachment&emailid='+jQuery('#emailid').val();
				},
				paramName: 'qqfile',
				parallelUploads: 1,
				addRemoveLinks: true,
				createImageThumbnails: true,
				dictRemoveFile: MailManager.i18n('JSLBL_Delete'),
				uploadMultiple: false,
				clickable: ['#file-uploader-message', '#file-uploader']
			});
			uploader.on('success', function (file, response) {
				var res = JSON.parse(response);
				file.docid = res.result.docid;
				file.attachid = res.result.attachid;
				file.emailid = res.result.emailid;
				jQuery('#emailid').val(res.result.emailid);
			});
			uploader.on('removedfile', function (file) {
				MailManager.deleteAttachment(file.emailid, file.docid, this);
			});
			return uploader;
		},

		//draft
		mail_draft: function (id) {
			MailManager.close_all();
			MailManager.progress_show(MailManager.i18n('JSLBL_Loading'), ' ...');

			jQuery.ajax({
				method: 'POST',
				url: 'index.php?'+ MailManager._baseurl() + '_operation=mail&_operationarg=getdraftmail&id='+ encodeURIComponent(id)
			}).done(function (response) {
				MailManager.progress_hide();
				jQuery('#_replydiv_').show();
				var responseJSON = JSON.parse(response);

				MailManager.mail_reply_rteinit(responseJSON['result'][0][0]['description']);

				jQuery('#_mail_replyfrm_to_').val(JSON.parse(responseJSON['result'][0][0]['saved_toid']));
				jQuery('#_mail_replyfrm_cc_').val(JSON.parse(responseJSON['result'][0][0]['ccmail']));
				jQuery('#_mail_replyfrm_bcc_').val(JSON.parse(responseJSON['result'][0][0]['bccmail']));
				jQuery('#_mail_replyfrm_subject_').val(responseJSON['result'][0][0]['subject']);
				jQuery('#emailid').val(responseJSON['result'][0][0]['id']);
				var dzelem = document.getElementById('file-uploader');
				var attachments = responseJSON['result'][0]['attachments'];
				if (attachments != null) {
					for (var i=0; i<attachments.length; i++) {
						var fsize = MailManager.computeFileSizeToBytes(attachments[i]['size']);
						dzelem.dropzone.emit('addedfile', {name:attachments[i]['name'], size:fsize, emailid:id, docid:attachments[i]['docid']});
						dzelem.dropzone.emit('complete', {name:attachments[i]['name'], size:fsize, emailid:id, docid:attachments[i]['docid']});
					}
				}
				jQuery('#attachmentCount').val(attachments.length);
				jQuery('#upload_target').children().remove();

				// Updated to highlight selected folder
				MailManager.updateSelectedFolder('mm_compose');
				jQuery('#mm_selected_folder').val('mm_compose');
			});
		},

		deleteAttachment : function (id, docid, ele) {
			MailManager.progress_show(MailManager.i18n('JSLBL_Loading'), ' ...');
			jQuery.ajax({
				method: 'POST',
				url: 'index.php?'+ MailManager._baseurl() + '_operation=mail&_operationarg=deleteAttachment&emailid='+ encodeURIComponent(id)
							+'&docid='+ encodeURIComponent(docid)
			}).done(function (response) {
				MailManager.progress_hide();
				var responseJSON = JSON.parse(response);
				if (responseJSON.result.success) {
					MailManager.progress_hide();
					var count = jQuery('#attachmentCount').val();
					jQuery('#attachmentCount').val(--count);
				} else {
					MailManager.show_error(MailManager.i18n('JSLBL_ATTACHMENT_NOT_DELETED'));
				}
			});
		},

		/* Reply to mail */
		mail_reply: function (all) {
			if (typeof(all) == 'undefined') {
				all = true;
			}

			var from = jQuery('#_mailopen_from').html();
			var replyto = jQuery('#_mailopen_replyto').html();
			var cc = jQuery('#_mailopen_cc') ? jQuery('#_mailopen_cc').html() : '';
			var subject = jQuery('#_mailopen_subject').html();
			var body = jQuery('#_mailopen_body').html();
			var date = jQuery('#_mailopen_date').html();

			MailManager.close_all();
			jQuery('#_replydiv_').show();

			// TODO Strip invalid HTML?
			if (all) {
				jQuery('#_mail_replyfrm_cc_').val(cc);
			} else {
				jQuery('#_mail_replyfrm_cc_').val('');
			}

			jQuery('#_mail_replyfrm_to_').val(replyto=='' ? from : replyto);
			jQuery('#_mail_replyfrm_bcc_').val('');
			var replySubject = (subject.toUpperCase().indexOf('RE:') == 0) ? subject : 'Re: ' + subject;
			jQuery('#_mail_replyfrm_subject_').val(replySubject);
			var replyBody = MailManager.sprintf(
				(emailSignatureBeforeQuote ? '<p></p>'+emailSignature : '<p></p>') +
				'<p style="margin:0;padding:0;">%s, %s, %s:</p><blockquote style="border:0;margin:0;border-left:1px solid gray;padding:0 0 0 2px;">%s</blockquote><br/>'
				+ (emailSignatureBeforeQuote ? '' : emailSignature),
				MailManager.i18n('JSLBL_ON')+' '+date,
				from,
				MailManager.i18n('JSLBL_WROTE'),
				body
			);
			jQuery('#emailid').val('');
			jQuery('#attachmentCount').val('');
			MailManager.mail_reply_rteinit(replyBody);
			var dzelem = jQuery('#file-uploader');
			if (dzelem.dropzone && dzelem[0].dropzone != undefined) {
				dzelem[0].dropzone.removeAllFiles(true);
			} else {
				var dz = MailManager.createUploader();
			}
			dzelem.hide();

			// Update the seleted folders to highlight them.
			MailManager.updateSelectedFolder('mm_compose');
			jQuery('#mm_selected_folder').val('mm_compose');
		},

		/* Track and Initialize RTE instance for reply */
		mail_reply_rteinstance: false,
		mail_reply_rteinit: function (data) {
			if (!MailManager.mail_reply_rteinstance) {
				var textAreaName = '_mail_replyfrm_body_';
				CKEDITOR.replace(textAreaName, {
					toolbar: 'Full',
					extraPlugins: 'uicolor',
					uiColor: '#dfdff1'
				});
				MailManager.mail_reply_rteinstance = CKEDITOR.instances[textAreaName];
			}

			MailManager.mail_reply_rteinstance.setData(data, function () {
			});
			MailManager.mail_reply_rteinstance.focus();
		},

		/* Close reply UI */
		mail_reply_close: function () {
			jQuery('#_replydiv_').hide();
			if (jQuery('#mm_selected_folder').val()=='mm_settings') {
				MailManager.open_settings();
			} else {
				var contentDiv2 = jQuery('#_contentdiv2_').html();
				if (contentDiv2 == '') {
					jQuery('#_contentdiv_').show();
				} else {
					jQuery('#_contentdiv2_').show();
				}

				// Updated to highlight selected folder
				var currentSelectedFolder = jQuery('#mailbox_folder').val();
				MailManager.updateSelectedFolder(currentSelectedFolder);
				jQuery('#mm_selected_folder').val(currentSelectedFolder);
			}
		},

		/* Forward email */
		mail_forward: function (messageId) {

			// Update the seleted folders to highlight them.
			MailManager.updateSelectedFolder('mm_compose');
			jQuery('#mm_selected_folder').val('mm_compose');

			var from = jQuery('#_mailopen_from').html();
			var to = jQuery('#_mailopen_to').html();
			var cc = jQuery('#_mailopen_cc') ? jQuery('#_mailopen_cc').html() : '';
			var subject = jQuery('#_mailopen_subject').html();
			var body = jQuery('#_mailopen_body').html();
			var date = jQuery('#_mailopen_date').html();

			MailManager.close_all();
			jQuery('#_replydiv_').show();

			var replyfrm = document.getElementById('_mail_replyfrm_');

			var fwdMsgMetaInfo = MailManager.i18n('JSLBL_FROM') + from + '<br/>'+MailManager.i18n('JSLBL_DATE') + date + '<br/>'+MailManager.i18n('JSLBL_SUBJECT') + subject;
			if (to != '' && to != null) {
				fwdMsgMetaInfo += '<br/>'+MailManager.i18n('JSLBL_TO') + to;
			}
			if (cc != '' && cc != null) {
				fwdMsgMetaInfo += '<br/>'+MailManager.i18n('JSLBL_CC') + cc;
			}
			fwdMsgMetaInfo += '<br/>';

			replyfrm.to.value = '';
			replyfrm.cc.value = '';
			replyfrm.bcc.value = '';
			replyfrm.subject.value = (subject.toUpperCase().indexOf('FWD:') == 0) ? subject : 'Fwd: ' + subject;
			replyfrm.body.value = MailManager.sprintf(
				(emailSignatureBeforeQuote ? '<p></p>'+emailSignature : '<p></p>') +
				'<p>%s<br/>%s</p>%s' +
				(emailSignatureBeforeQuote ? '<br/>' : emailSignature),
				MailManager.i18n('JSLBL_FORWARD_MESSAGE_TEXT'),
				fwdMsgMetaInfo,
				body
			);

			replyfrm.emailid.value = '';
			replyfrm.attachmentCount.value = '';
			MailManager.mail_reply_rteinit(replyfrm.body.value);
			var dzelem = jQuery('#file-uploader');
			if (dzelem.dropzone && dzelem[0].dropzone != undefined) {
				dzelem[0].dropzone.removeAllFiles(true);
			} else {
				var dz = MailManager.createUploader();
			}
			dzelem.hide();

			var folder = jQuery('input[name=_folder]').val();

			var attachmentCount = jQuery('#_mail_attachmentcount_').val();
			if (attachmentCount) {
				VtigerJS_DialogBox.block();
				jQuery.ajax({
					method: 'POST',
					url: 'index.php?'+ MailManager._baseurl() + '_operation=mail&_operationarg=forward&messageid=' +
						encodeURIComponent(messageId) +'&folder=' + encodeURIComponent(folder) +'&subject=' + encodeURIComponent(replyfrm.subject.value)
				}).done(function (transport) {
					var response = MailManager.removeHidElement(transport);
					var responseJSON = JSON.parse(response);
					if (responseJSON['success']) {
						jQuery('#emailid').val(responseJSON['result']['emailid']);
						var attachments = responseJSON['result']['attachments'];
						if (attachments != '' && attachments != null) {      //If attachments are present
							for (var i=0; i<attachments.length; i++) {
								MailManager.add_data_to_relatedlist(attachments[i]);
							}
						}
					}
					VtigerJS_DialogBox.unblock();
				});
			}
		},

		/* Send reply to email */
		mail_reply_send: function (form) {
			if (MailManager.mail_reply_rteinstance) {
				MailManager.mail_reply_rteinstance.updateElement();
			}
			var meta = MailManager.mail_open_meta;

			var msguid = encodeURIComponent(meta['msguid'] ? meta['msguid'].replace('<', '&lt;').replace('>', '&gt;') : '');

			if (!MailManager.validateEmailFields(form.to.value, form.cc.value, form.bcc.value, form.replyto.value)) {
				return false;
			}

			if (form.to.value == '') {
				MailManager.show_error(MailManager.i18n('JSLBL_Recepient_Cannot_Be_Empty'));
				return false;
			}
			if (form.subject.value == '' && !confirm(MailManager.i18n('JSLBL_SendWith_EmptySubject'))) {
				return false;
			}
			var bodyval = document.getElementById('_mail_replyfrm_body_').value.trim();
			if (bodyval == '<br />' && !confirm(MailManager.i18n('JSLBL_SendWith_EmptyText'))) {
				return false;
			}
			if (bodyval == '' && !confirm(MailManager.i18n('JSLBL_SendWith_EmptyText'))) {
				return false;
			}
			MailManager.progress_show(MailManager.i18n('JSLBL_Sending'), ' ...');

			var params = {
				'_operation':'mail',
				'_operationarg':'send',
				'_msgid':msguid,
				'to':encodeURIComponent(form.to.value),
				'replyto':encodeURIComponent(form.replyto.value),
				'cc':encodeURIComponent(form.cc.value),
				'bcc':encodeURIComponent(form.bcc.value),
				'subject':encodeURIComponent(form.subject.value),
				'body':encodeURIComponent(form.body.value),
				'linkto':encodeURIComponent(form.linkto.value),
				'emailid':encodeURIComponent(form.emailid.value)
			};
			var baseurl = MailManager._baseurl();
			MailManager.Request('index.php?'+baseurl, params, function (transport) {
				MailManager.progress_hide();
				var response = MailManager.removeHidElement(transport);
				var responseJSON = JSON.parse(response);
				if (responseJSON['success']) {
					MailManager.mail_reply_close();
					MailManager.show_message(MailManager.i18n('JSLBL_MAIL_SENT'));
				} else {
					MailManager.show_error(MailManager.i18n('JSLBL_Failed_To_Send_Mail') +
						': ' + responseJSON['error']['message']);
				}
			});
		},

		/* Send reply to email */
		save_draft: function (form) {
			if (MailManager.mail_reply_rteinstance) {
				MailManager.mail_reply_rteinstance.updateElement();
			}

			if (!MailManager.validateEmailFields(form.to.value, form.cc.value, form.bcc.value, form.replyto.value)) {
				return false;
			}

			if (form.subject.value == '' ) {
				if (!confirm(MailManager.i18n('JSLBL_SaveWith_EmptySubject'))) {
					return false;
				}
			}

			MailManager.progress_show(MailManager.i18n('JSLBL_Saving'), ' ...');
			var params = {
				'_operation':'mail',
				'_operationarg':'save',
				'emailid':encodeURIComponent(form.emailid.value),
				'to':encodeURIComponent(form.to.value),
				'replyto':encodeURIComponent(form.replyto.value),
				'cc':encodeURIComponent(form.cc.value),
				'bcc':encodeURIComponent(form.bcc.value),
				'subject':encodeURIComponent(form.subject.value),
				'body':encodeURIComponent(form.body.value),
				'linkto':encodeURIComponent(form.linkto.value),
				'currentid':encodeURIComponent(form.emailid.value)
			};
			var baseurl = MailManager._baseurl();
			MailManager.Request('index.php?'+baseurl, params, function (transport) {
				MailManager.progress_hide();
				var response = MailManager.removeHidElement(transport);
				var responseJSON = JSON.parse(response);

				if (responseJSON['success']) {
					MailManager.show_message(MailManager.i18n('JSLBL_DRAFT_MAIL_SAVED'));
				} else {
					MailManager.show_error(MailManager.i18n('JSLBL_Failed_To_Save_Mail'));
				}
			});
		},

		folder_drafts: function (page) {
			MailManager.progress_show(MailManager.i18n('JSLBL_Loading'), ' ' +MailManager.i18n('JSLBL_Drafts') + '...');
			var params = {
				'_operation':'folder',
				'_operationarg':'drafts',
				'_page':encodeURIComponent(page)
			};
			var baseurl = MailManager._baseurl();
			MailManager.Request('index.php?'+baseurl, params, function (transport) {
				MailManager.progress_hide();
				MailManager.mail_close();
				var response = MailManager.removeHidElement(transport);
				jQuery('#_contentdiv_').html(response);
				// Initialize upload
				var dzelem = jQuery('#file-uploader');
				if (dzelem.dropzone && dzelem[0].dropzone != undefined) {
					dzelem[0].dropzone.removeAllFiles();
				} else {
					var dz = MailManager.createUploader();
				}

				MailManager.bindEnterKeyForSearch();

				// Update the selected folder to highlight selected folder
				MailManager.updateSelectedFolder('mm_drafts');
				jQuery('#mm_selected_folder').val('mm_drafts');
				jQuery('#mailbox_folder').val('mm_drafts');
			});
		},

		search_popupui: function (target, handle) {
			MailManager.progress_show(MailManager.i18n('JSLBL_Loading'), ' ...');
			var params = {
				'_operation':'search',
				'_operationarg':'popupui'
			};
			var baseurl = MailManager._baseurl();
			MailManager.Request('index.php?'+baseurl, params, function (transport) {
				ldsModal.show('modalTitle', transport.responseText, 'medium', "MailManager.search_consume_input(document.getElementById('mm_searchemailform'));ldsModal.close();");
				ldsModal.updateTitle(MailManageri18nInfo.JSLBL_Search_For_Email);
				MailManager.progress_hide();
				MailManager.search_popup_init(target);
			});
		},

		search_popup_init: function (target) {
			var url = 'index.php?' + MailManager._baseurl() + '_operation=search&_operationarg=email&';

			if (jQuery('#_search_popupui_target_')) {
				jQuery('#_search_popupui_target_').val(target);
			}

			var elem = jQuery('#_search_popupui_input_');
			if (elem) {
				if (elem.prop('_tokeninput_init_')) {
					return;
				}
				elem.tokenInput(url, {
					hintText: MailManager.i18n('JSLBL_Search_For_Email') + '...',
					noResultsText: MailManager.i18n('JSLBL_Nothing_Found'),
					searchingText: MailManager.i18n('JSLBL_Searching_Please_Wait') + '...',
					minChars : 3,
					classes: {
						tokenList: 'token-input-list-facebook',
						token: 'token-input-token-facebook',
						tokenDelete: 'token-input-delete-token-facebook',
						selectedToken: 'token-input-selected-token-facebook',
						highlightedToken: 'token-input-highlighted-token-facebook',
						dropdown: 'token-input-dropdown-facebook',
						dropdownItem: 'token-input-dropdown-item-facebook',
						dropdownItem2: 'token-input-dropdown-item2-facebook',
						selectedDropdownItem: 'token-input-selected-dropdown-item-facebook',
						inputToken: 'token-input-input-token-facebook'
					}
				});
				elem.prop('_tokeninput_init_', true);
			}
		},

		search_consume_input: function (form) {
			var inputstr = form._search_popupui_input_.value;
			var target = form._search_popupui_target_.value;

			// Based on target perform the operation
			var targetnode = document.getElementById(target);
			if (targetnode) {
				if (targetnode.value.length > 0 && targetnode.value.substr(-1) != ',') {
					inputstr = ',' + inputstr;
				}
				targetnode.value += inputstr;
			}
			MailManager.popup_close();
		},

		popup_close: function () {
			jQuery('#_popupsearch_').html('');
			jQuery('#_popupsearch_').hide();
		},

		clear_input: function (id) {
			if (jQuery('#'+id)) {
				jQuery('#'+id).val('');
			}
		},

		removeHidElement: function (jsonresponse) {
			// PHPSESSID is General value
			// Session Name should be picked from php.ini
			var replaceJsonTxt = '';
			if (typeof(jsonresponse)=='string') {
				replaceJsonTxt = jsonresponse.replace('/<input type="hidden" name="PHPSESSID" value=["]{1}[a-z0-9]+["]{1}\s{0,1}[/]?[>]?/', '');
			} else if (typeof(jsonresponse)=='object') {
				replaceJsonTxt = jsonresponse.responseText.replace('/<input type="hidden" name="PHPSESSID" value=["]{1}[a-z0-9]+["]{1}\s{0,1}[/]?[>]?/', '');
			}
			return replaceJsonTxt;
		},

		massMailDelete: function (folder) {
			var cb_elements = jQuery('[name="mc_box"]');
			var temp = new Array();
			var len = jQuery('[name="mc_box"]').length;
			for (var i = 0; i < len; i++) {
				if (cb_elements[i].checked) {
					temp.push(cb_elements[i].value);
				}
			}
			if (temp.length == 0) {
				MailManager.show_error(MailManager.i18n('JSLBL_NO_EMAILS_SELECTED'));
			} else {
				MailManager.maildelete(folder, temp, true);
			}
		},

		maildelete: function (foldername, msgno, reloadfolder) {
			if (!confirm(MailManager.i18n('JSLBL_Delete_Confirm'))) {
				return;
			}

			MailManager.progress_show(MailManager.i18n('JSLBL_Deleting'), ' ...');
			var params = {
				'_operation':'mail',
				'_operationarg':'delete',
				'_folder':encodeURIComponent(foldername),
				'_msgno':encodeURIComponent(msgno)
			};
			var baseurl = MailManager._baseurl();
			MailManager.Request('index.php?'+baseurl, params, function () {
				for (var i = 0; i<msgno.length; i++) {
					var ele ='#_mailrow_'+msgno[i];
					jQuery(ele).fadeOut(1500, function () {
						jQuery(ele).remove();
					});
				}
				if (reloadfolder) {
					if (foldername == '__vt_drafts') {
						MailManager.folder_drafts();
					} else {
						MailManager.folder_open(foldername);
					}
				}
			});
		},

		show: function (ele) {
			jQuery('#' + ele).css('display', 'block');
		},

		getDocuments : function () {
			if (!MailManager.checkUploadCount()) {
				return false;
			}
			var emailId = jQuery('#emailid').val();
			if (emailId == '') {
				var body = CKEDITOR.instances['_mail_replyfrm_body_'];
				if (body != '') {
					body =  body.getData();
				}

				var to = jQuery('#_mail_replyfrm_to_').val();
				var cc = jQuery('#_mail_replyfrm_cc_').val();
				var bcc = jQuery('#_mail_replyfrm_bcc_').val();
				var subject = jQuery('#_mail_replyfrm_subject_').val();
				VtigerJS_DialogBox.block();

				var params = {
					'_operation':'mail',
					'_operationarg':'save',
					'to':encodeURIComponent(to),
					'cc':encodeURIComponent(cc),
					'bcc':encodeURIComponent(bcc),
					'subject':encodeURIComponent(subject),
					'body':encodeURIComponent(body)
				};
				var baseurl = MailManager._baseurl();
				MailManager.Request('index.php?'+baseurl, params, function (response) {
					if (typeof(response)=='string') {
						var responseText = JSON.parse(response);
					} else if (typeof(response)=='object') {
						var responseText = JSON.parse(response.responseText);
					}
					emailId = responseText.result.emailid;
					jQuery('#emailid').val(emailId);
					window.open('index.php?module=Documents&return_module=MailManager&action=Popup&popuptype=detailview&form=EditView&form_submit=false&recordid='+emailId+'&forrecord='+emailId+'&srcmodule=MailManager&popupmode=ajax&RLreturn_module=MailManager&RLparent_id='+emailId+'&callback=MailManager.add_data_to_relatedlist', 'test', cbPopupWindowSettings);
				});
			} else {
				window.open('index.php?module=Documents&return_module=MailManager&action=Popup&popuptype=detailview&form=EditView&form_submit=false&recordid='+emailId+'&forrecord='+emailId+'&srcmodule=MailManager&popupmode=ajax&RLreturn_module=MailManager&RLparent_id='+emailId+'&callback=MailManager.add_data_to_relatedlist', 'test', cbPopupWindowSettings);
			}
			VtigerJS_DialogBox.unblock();
		},

		search_drafts: function () {
			var string = jQuery('#search_txt').val();
			if (string == '') {
				MailManager.show_error(MailManager.i18n('JSLBL_ENTER_SOME_VALUE'));
				return false;
			}

			var type   = jQuery('#search_type').val();
			MailManager.progress_show(MailManager.i18n('JSLBL_Searching'), ' ...');

			var params = {
				'_operation':'folder',
				'_operationarg':'drafts',
				'q':encodeURIComponent(string),
				'type':encodeURIComponent(type)
			};
			var baseurl = MailManager._baseurl();
			MailManager.Request('index.php?'+baseurl, params, function (response) {
				MailManager.progress_hide();
				MailManager.mail_close();
				var responseText = MailManager.removeHidElement(response);
				jQuery('#_contentdiv_').html(responseText);
			});

			return false;
		},

		search_mails: function (foldername) {
			var string = jQuery('#search_txt').val();
			if (string == '') {
				MailManager.show_error(MailManager.i18n('JSLBL_ENTER_SOME_VALUE'));
				return false;
			}
			var type   = jQuery('#search_type').val();
			MailManager.progress_show(MailManager.i18n('JSLBL_Searching'), ' ...');

			var params = {
				'_operation':'folder',
				'_operationarg':'open',
				'q':encodeURIComponent(string),
				'type':encodeURIComponent(type),
				'_folder':encodeURIComponent(foldername)
			};
			var baseurl = MailManager._baseurl();
			MailManager.Request('index.php?'+baseurl, params, function (response) {
				MailManager.progress_hide();
				MailManager.mail_close();
				var responseText = MailManager.removeHidElement(response);
				jQuery('#_contentdiv_').html(responseText);
				jQuery('#_mailfolder_' + foldername).addClass('mm_folder_selected');

				MailManager.bindEnterKeyForSearch();
			});

			return false;
		},

		add_data_to_relatedlist: function (res) {
			if (res.error != undefined) {
				alert('error');
				window.close();
				return false;
			}
			if (window.opener) {
				var dzelem = window.opener.document.getElementById('file-uploader');
			} else {
				var dzelem = document.getElementById('file-uploader');
			}
			if (dzelem.dropzone) {
				dzelem.dropzone.emit('addedfile', {name:res.name, size:res.size, emailid:res.emailid, docid:res.docid});
				dzelem.dropzone.emit('complete', {name:res.name, size:res.size, emailid:res.emailid, docid:res.docid});
			}
			// Update the attachment counter
			MailManager.uploadCountUpdater();
			if (window.opener && document.getElementById('closewindow').value=='true') {
				window.close();
			}
		},

		computeDisplayableFileSize : function (size) {
			var fileSize;
			if (size <= 1024) {
				fileSize = size+'b';
			} else if (size > 1024 && size < 1048576) {
				fileSize = (Math.round(size/1024))+'kB';
			} else if (size > (1024*1024)) {
				fileSize = (Math.round(size/(1024*1024)))+'MB';
			} else {
				fileSize = size;
			}
			return fileSize;
		},
		computeFileSizeToBytes : function (size) {
			var fileSize;
			if (size.slice(-1) == 'b') {
				fileSize = size.substring(0, size.length - 1)*1;
			} else if (size.slice(-2) == 'kB') {
				fileSize = (Math.round(size.substring(0, size.length - 2)*1024));
			} else if (size.slice(-2) == 'MB') {
				fileSize = (Math.round(size.substring(0, size.length - 2)*(1024*1024)));
			} else {
				fileSize = size;
			}
			return fileSize;
		},

		validateEmailFields :  function (to, cc, bcc, replyto) {
			if (replyto != '') {
				if (!MailManager.mail_validate(replyto)) {
					return false;
				}
			}
			if (to != '') {
				if (!MailManager.mail_validate(to)) {
					return false;
				}
			}
			if (cc != '') {
				if (!MailManager.mail_validate(cc)) {
					return false;
				}
			}
			if (bcc != '') {
				if (!MailManager.mail_validate(bcc)) {
					return false;
				}
			}
			return true;
		},

		mail_validate : function (str) {
			var email_regex = /^[a-zA-Z0-9]+([\_\-\.]*[a-zA-Z0-9]+[\_\-]?)*@[a-zA-Z0-9]+([\_\-]?[a-zA-Z0-9]+)*\.+([\_\-]?[a-zA-Z0-9])+(\.?[a-zA-Z0-9]+)*$/;
			var arr = str.split(',');
			var tmp;
			for (var i=0; i<=arr.length-1; i++) {
				tmp = arr[i];
				if (tmp.match('<') && tmp.match('>')) {
					if (!MailManager.findAngleBracket(arr[i])) {
						var errorMsg = MailManager.i18n('JSLBL_EMAIL_FORMAT_INCORRECT');
						MailManager.show_error(errorMsg+': '+arr[i]);
						return false;
					}
				} else if (trim(arr[i]) != '' && !(email_regex.test(trim(arr[i])))) {
					var errorMsg2 = MailManager.i18n('JSLBL_EMAIL_FORMAT_INCORRECT');
					MailManager.show_error(errorMsg2+': '+arr[i]);
					return false;
				}
			}
			return true;
		},

		findAngleBracket : function (mailadd) {
			var strlen = mailadd.length;
			var gt = 0;
			var lt = 0;
			var ret = '';
			for (var i=0; i<strlen; i++) {
				if (mailadd.charAt(i) == '<' && gt == 0) {
					lt = 1;
				}
				if (mailadd.charAt(i) == '>' && lt == 1) {
					gt = 1;
				}
				if (mailadd.charAt(i) != '<' && lt == 1 && gt == 0) {
					ret = ret + mailadd.charAt(i);
				}
			}
			return (/^[a-z0-9]([a-z0-9_\-\.]*)@([a-z0-9_\-\.]*)(\.[a-z]{2,3}(\.[a-z]{2}){0,2})$/.test(ret));
		},

		uploadCountUpdater : function () {
			var countElement;
			if (jQuery('#attachmentCount').length) {
				countElement = jQuery('#attachmentCount');
			} else {
				countElement = jQuery(window.opener.document).find('#attachmentCount');
			}
			var MailManagerCurrentUploadCount = countElement.val();
			if (MailManagerCurrentUploadCount == null || MailManagerCurrentUploadCount == '') {
				MailManagerCurrentUploadCount = 0;
			}
			countElement.val(++MailManagerCurrentUploadCount);
		},

		checkUploadCount : function () {
			var MailManagerCurrentUploadCount = jQuery('#attachmentCount').val();
			if (MailManagerCurrentUploadCount >= MailManager.MailManagerUploadLimit) {
				MailManager.show_error(MailManager.i18n('JSLBL_FILEUPLOAD_LIMIT_EXCEEDED'));
				return false;
			}
			return true;
		},

		AjaxDuplicateValidate : function (module, fieldname, form) {
			var deferred = jQuery.Deferred();

			function execute() {
				var fieldvalue = encodeURIComponent(trim(getObj(fieldname).value));
				var recordid = getObj('record').value;

				function validate() {
					if (fieldvalue == '') {
						MailManager.show_error(MailManager.i18n('JSLBL_ACCOUNTNAME_CANNOT_EMPTY'));
						deffered.reject(form);
						return false;
					}
					return true;
				}

				function requestOnComplete(response) {
					var str = response.responseText;
					VtigerJS_DialogBox.unblock();
					if (str.indexOf('SUCCESS') > -1) {
						deferred.resolve(form);
					} else {
						alert(str);
						deferred.reject(form);
					}
				}

				if (validate()) {
					VtigerJS_DialogBox.block();
					var params = {
						'module':encodeURIComponent(module),
						'action':encodeURIComponent(module)+'Ajax',
						'file':'Save',
						'dup_check':true,
						'record':encodeURIComponent(recordid)
					};
					params[fieldname] = encodeURIComponent(fieldvalue);
					MailManager.Request('index.php?', params, requestOnComplete);
					VtigerJS_DialogBox.unblock();
				}
			}
			// Trigger the function call
			execute();
			return deferred.promise();
		},

		Request : function (url, params, callback) {
			return jQuery.ajax({
				url  : url,
				type : 'POST',
				data : params,
				complete : function (response) {
					callback(response);
				}
			});
		},

		getEncodedParameterString : function (paramObject) {
			var encodedParams = new Array();
			for (var key in paramObject) {
				encodedParams.push(key+'='+ paramObject[key]);
			}
			encodedParams = encodedParams.join('&');
			return encodedParams;
		},

		clearSearchString : function () {
			jQuery('#search_txt').val('');
			jQuery('#search_type').val('');
		},

		resetLinkToDropDown : function () {
			jQuery('#_mlinktotype').val('');
		},

		resetFolderDropDown : function () {
			jQuery('#moveFolderList').val('');
		},

		toggleSelect : function (state, relCheckName) {
			var elements = jQuery('[name='+relCheckName+']');
			for (var i=0; i<elements.length; i++) {
				var element = jQuery(elements[i]);
				if (state) {
					element.prop('checked', state).parent().parent().addClass('mm_lvtColDataHover').removeClass('mm_lvtColData');
				} else {
					element.prop('checked', state).parent().parent().removeClass('mm_lvtColDataHover').addClass('mm_lvtColData');
				}
			}
		},

		toggleSelectMail : function (state, element) {
			if (state) {
				jQuery(element).parent().parent().addClass('mm_lvtColDataHover').removeClass('mm_lvtColData');
			} else {
				jQuery(element).parent().parent().addClass('mm_lvtColData').removeClass('mm_lvtColDataHover');
			}
			var	name = element.name;
			default_togglestate(name, 'parentCheckBox');
		},

		highLightListMail : function (element) {
			jQuery(element).addClass('mm_lvtColDataHover').removeClass('mm_lvtColData');
		},

		unHighLightListMail : function (element) {
			jQuery(element).addClass('mm_lvtColData').removeClass('mm_lvtColDataHover');
			var state = jQuery(element).find('input:nth-child(1)')[0].checked;
			if (state) {
				jQuery(element).addClass('mm_lvtColDataHover');
			}
		}
	};
}
/** Adding Attachment associated with the template to the drop-zone */
function addAttachments(entity_id, recordid, mod, popupmode, callback) {
	var return_module = 'MailManager';
	var emailId = jQuery('#emailid').val();
	if (emailId == '') {
		var to = jQuery('#_mail_replyfrm_to_').val();
		var cc = jQuery('#_mail_replyfrm_cc_').val();
		var bcc = jQuery('#_mail_replyfrm_bcc_').val();
		VtigerJS_DialogBox.block();
		var params = {
			'_operation':'mail',
			'_operationarg':'save',
			'to':encodeURIComponent(to),
			'cc':encodeURIComponent(cc),
			'bcc':encodeURIComponent(bcc),
			'subject':'',
			'body':''
		};
		var baseurl = MailManager._baseurl();
		MailManager.Request('index.php?'+baseurl, params, function (response) {
			if (typeof(response)=='string') {
				var responseText = JSON.parse(response);
			} else if (typeof(response)=='object') {
				var responseText = JSON.parse(response.responseText);
			}
			emailId = responseText.result.emailid;
			jQuery.ajax({
				method: 'POST',
				url: 'index.php?module='+return_module+'&action='+return_module+'Ajax&file=updateRelations&destination_module='+mod+'&entityid='+entity_id+'&parentid='+emailId+'&mode=Ajax'
			}).done(function (response) {
				VtigerJS_DialogBox.unblock();
				var res = JSON.parse(response);
				jQuery('#emailid').val(res.emailid);
				MailManager.add_data_to_relatedlist(res);
			});
		});
	} else {
		jQuery.ajax({
			method: 'POST',
			url: 'index.php?module='+return_module+'&action='+return_module+'Ajax&file=updateRelations&destination_module='+mod+'&entityid='+entity_id+'&parentid='+emailId+'&mode=Ajax'
		}).done(function (response) {
			VtigerJS_DialogBox.unblock();
			var res = JSON.parse(response);
			jQuery('#emailid').val(res.emailid);
			MailManager.add_data_to_relatedlist(res);
		});
	}
	return false;
}
