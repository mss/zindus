/* ***** BEGIN LICENSE BLOCK *****
 * 
 * "The contents of this file are subject to the Mozilla Public License
 * Version 1.1 (the "License"); you may not use this file except in
 * compliance with the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 * 
 * Software distributed under the License is distributed on an "AS IS"
 * basis, WITHOUT WARRANTY OF ANY KIND, either express or implied. See the
 * License for the specific language governing rights and limitations
 * under the License.
 * 
 * The Original Code is Zindus Sync.
 * 
 * The Initial Developer of the Original Code is Toolware Pty Ltd.
 *
 * Portions created by Initial Developer are Copyright (C) 2007-2009
 * the Initial Developer. All Rights Reserved.
 * 
 * Contributor(s): Leni Mayo
 * 
 * ***** END LICENSE BLOCK *****/
// $Id: folderconverter.js,v 1.18 2009-06-15 06:18:09 cvsuser Exp $

FolderConverter.PREFIX_CLASS_NONE     = 1;
FolderConverter.PREFIX_CLASS_INTERNAL = 2;
FolderConverter.PREFIX_CLASS_PRIMARY  = 3;
FolderConverter.PREFIX_CLASS_SHARED   = 4;

FolderConverter.PREFIX_PRIMARY_ACCOUNT   = APP_NAME + "/";
FolderConverter.PREFIX_FOREIGN_READONLY  = APP_NAME + "-";
FolderConverter.PREFIX_FOREIGN_READWRITE = APP_NAME + "+";
FolderConverter.PREFIX_INTERNAL          = APP_NAME + "_";

function FolderConverter()
{
	this.m_bimap_pab = new BiMap(              [FORMAT_TB,           FORMAT_ZM,          FORMAT_GD ],
	                                           [TB_PAB,              ZM_FOLDER_CONTACTS, GD_PAB    ]);

	this.m_bimap_emailed_contacts = new BiMap( [FORMAT_TB,           FORMAT_ZM                  ],
	                                           [TB_EMAILED_CONTACTS, ZM_FOLDER_EMAILED_CONTACTS ]);

	this.m_prefix_length = FolderConverter.PREFIX_PRIMARY_ACCOUNT.length;  // and we assume that all prefixes have the same length

	this.m_localised_pab = null;               // the localised equivalent of "Personal Address Book" eg "Adresses Personnelles"
	this.m_localised_emailed_contacts = null;  // the localised equivalent of "Emailed Contacts"      eg "Personnes contactées par mail"

	// A locale eg 'en-US' is made up of language (en) and nation/location (US)
	// This list aims to be a superset of Zimbra's supported locales...
	//
	// Note - if any of the "Emailed Contacts" translations change, there will have to be code that migrates the old name to the new...
	// FIXME: update for new locales as per:
	//   http://www.zimbra.com/products/languages.html
	//   http://wiki.zimbra.com/index.php?title=Translations
	//
	this.m_locale_map  = PerLocaleStatic["Emailed Contacts"];

	this.m_locale_names_to_migrate = new Object();

	// add any deprecated translations here...

	this.m_locale_names_to_migrate["Emailed Contacts"] = true;

	// add the current set of translations...
	//
	for (var i in this.m_locale_map)
		this.m_locale_names_to_migrate[this.m_locale_map[i]] = true;

	this.m_logger = newLogger("FolderConverter");
}

// This method converts to/from ATTR_NAME attributes in Tb and Zm maps.
// Note this this doesn't always return the public facing folder names because
// Zm:Contacts maps to Tb:TB_PAB and Zm:Emailed Contacts maps to TB_EMAILED_CONTACTS.
// For Zm, the map name is always the same as the name we get in the SyncResponse.
// For Tb, the map name must be converted to a public-facing name (to handle TB_PAB and TB_EMAILED_CONTACTS)
// The method has to take a zfi to distinguish between folders that the in the primary account vs foreign folders
//
FolderConverter.prototype.convertForMap = function(format_to, format_from, zfi)
{
	var ret;

	zinAssert(arguments.length == 3); // catch programming errors
	zinAssertAndLog(typeof(zfi) == 'object', " zfi ain't an FeedItem object: " + zfi);

	zinAssertAndLog((zfi.type() == FeedItem.TYPE_FL && !zfi.isForeign()) || zfi.type() == FeedItem.TYPE_SF,
	                  "can't convertForMap zfi: " + zfi.toString());

	var name = zfi.get(FeedItem.ATTR_NAME);

	if (zfi.type() == FeedItem.TYPE_FL && this.m_bimap_pab.lookup(format_from, null) == name)
		ret = this.m_bimap_pab.lookup(format_to, null);
	else if (zfi.type() == FeedItem.TYPE_FL && this.m_bimap_emailed_contacts.lookup(format_from, null) == name)
		ret = this.m_bimap_emailed_contacts.lookup(format_to, null);  // this will assert if FORMAT_GD ... as it should ...
	else if (format_from == format_to)
		ret = name;
	else if (format_to == FORMAT_TB)
		ret = this.selectPrefix(zfi) + name;
	else // format_to == FORMAT_ZM
	{
		zinAssertAndLog(this.prefixClass(name) != FolderConverter.PREFIX_CLASS_NONE, name);
		ret = name.substring(this.m_prefix_length)
	}

	// this.m_logger.debug("FolderConverter.convert: name: " + name + " from: " + format_from +" to: " + format_to + " returns: " + ret);

	return ret;
}

// This method caters for the items in the Thunderbird map that correspond to "reserved" ids in Zimbra's map -
// ie the "Contacts" and "Emailed Contacts" folders.  These items get special treatment and their ATTR_NAME attribute
// are for internal-use only.  This routine returns their thunderbird addressbook names, and for all other ids
// returns the item's ATTR_NAME.

FolderConverter.prototype.convertForPublic = function(format_to, format_from, zfi)
{
	// catch programming errors
	zinAssertAndLog(arguments.length == 3 && this.m_localised_pab,
	                " arguments.length: " + arguments.length + " m_localised_pab: " + this.m_localised_pab + " zfi: " + zfi.toString());

	var ret = this.convertForMap(format_to, format_from, zfi);

	if (format_to == FORMAT_TB)
	{
		if (ret == TB_PAB)
			ret = this.m_localised_pab;
		else if (ret == TB_EMAILED_CONTACTS)
			ret = FolderConverter.PREFIX_PRIMARY_ACCOUNT +
			              (this.m_localised_emailed_contacts ? this.m_localised_emailed_contacts : ZM_FOLDER_EMAILED_CONTACTS);
	}

	zinAssert(ret);

	return ret;
}

FolderConverter.prototype.localised_pab = function()
{
	if (arguments.length == 1)
	{
		this.m_localised_pab = arguments[0];

		this.m_logger.debug("localised_pab: set to: " + this.m_localised_pab);
	}

	return this.m_localised_pab;
}

FolderConverter.prototype.localised_emailed_contacts = function()
{
	if (arguments.length == 1)
	{
		this.m_localised_emailed_contacts = arguments[0];

		this.m_logger.debug("localised_emailed_contacts: set to: " + this.m_localised_emailed_contacts);
	}

	return this.m_localised_emailed_contacts;
}

// Use logic that's similar to zimbra's (see soap.txt)
// 1. notused: zimbraPrefLocale of the target account if it is present 
// 2. Thunderbird's "general.useragent.locale" preference (if set)
// 3. "Emailed Contacts"
//
FolderConverter.prototype.translate_emailed_contacts = function()
{
	var ret = ZM_FOLDER_EMAILED_CONTACTS;
	var value, locale;
	
	if (arguments.length == 1)
		locale = arguments[0]; // used by the testharness to force a locale
	else
		locale = PerLocaleStatic.general_useragent();

	this.m_logger.debug("translate_emailed_contacts: general.useragent.locale: " + locale);

	// if (this.state.zimbraPrefLocale && value = this.emailed_contacts_per_locale(this.state.zimbraPrefLocale))
	// {
	// 	ret = value;
	// 	this.m_logger.debug("translate_emailed_contacts: selected on the basis of zimbraPrefLocale");
	// }

	if (locale && (value = this.emailed_contacts_per_locale(locale)))
	{
		ret = value;

		this.m_logger.debug("translate_emailed_contacts: selected on the basis of general.useragent.locale");
	}

	this.m_logger.debug("translate_emailed_contacts: returns: " + ret);

	return ret;
}

FolderConverter.prototype.emailed_contacts_per_locale = function(key)
{
	var ret = null;

	if (key in this.m_locale_map)
		ret = this.m_locale_map[key];
	else
	{
		key = key.substr(0, 2);

		if (key in this.m_locale_map)
			ret = this.m_locale_map[key];
	}

	return ret;
}

FolderConverter.prototype.selectPrefix = function(zfi)
{
	var ret;

	zinAssertAndLog((zfi.type() == FeedItem.TYPE_FL && !zfi.isForeign()) || zfi.type() == FeedItem.TYPE_SF,
	                  "can't selectPrefix zfi: " + zfi.toString());
	
	if (zfi.type() == FeedItem.TYPE_FL)
		ret = FolderConverter.PREFIX_PRIMARY_ACCOUNT;
	else
	{
		let perm = zmPermFromZfi(zfi.getOrNull(FeedItem.ATTR_PERM));

		if (perm & ZM_PERM_WRITE)
			ret = FolderConverter.PREFIX_FOREIGN_READWRITE;
		else if (perm & ZM_PERM_READ)
			ret = FolderConverter.PREFIX_FOREIGN_READONLY;
		else
			zinAssertAndLog(false, "unable to selectPrefix zfi: " + zfi.toString());
	}

	return ret;

}

FolderConverter.prototype.prefixClass = function(str)
{
	var ret    = FolderConverter.PREFIX_CLASS_NONE;
	var prefix = str.substring(0, this.m_prefix_length);

	if (prefix == FolderConverter.PREFIX_PRIMARY_ACCOUNT)        ret = FolderConverter.PREFIX_CLASS_PRIMARY;
	else if (prefix == FolderConverter.PREFIX_INTERNAL)          ret = FolderConverter.PREFIX_CLASS_INTERNAL;
	else if (prefix == FolderConverter.PREFIX_FOREIGN_READONLY)  ret = FolderConverter.PREFIX_CLASS_SHARED;
	else if (prefix == FolderConverter.PREFIX_FOREIGN_READWRITE) ret = FolderConverter.PREFIX_CLASS_SHARED;

	// this.m_logger.debug("prefixClass: str: " + str + " prefix: " + prefix + " returns: " + ret);

	return ret;
}
