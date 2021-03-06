
var util            = require('util');
var assert          = require('assert');
var _               = require('lodash');
var debug           = require('debug')('base:entity:keys');
var crypto          = require('crypto');
var Op              = require('./entityops');
var Types           = require('./entitytypes');

/**
 * Get value from equality operator or value
 * Used so that .exactFromConditions works in Entity.scan and Entity.query
 */
var valueFromOpOrValue = function(opOrValue) {
  // If no operator was used then it is a value
  if (!(opOrValue instanceof Op)) {
    return opOrValue;
  }

  // If it's an equality operator, then the value is the operand
  if (opOrValue.operator === 'eq') {
    return opOrValue.operand;
  }
  // Otherwise, no exact value is specified
  return undefined;
};

/**
 * Encode string-key, to escape characters for Azure Table Storage and replace
 * empty strings with a single '!', so that empty strings can be allowed.
 */
var encodeStringKey = function(str) {
  // Check for empty string
  if (str === '') {
    return '!';
  }
  // 1. URL encode
  // 2. URL encode all exclamation marks (replace ! with %21)
  // 3. URL encode all tilde (replace ~ with %7e)
  //    This ensures that when using ~ as separator in CompositeKey we can
  //    do prefix matching
  // 4. Replace % with exclamation marks for Azure compatibility
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/~/g, '%7e')
    .replace(/%/g, '!');
};

/** Decode string-key (opposite of encodeStringKey) */
var decodeStringKey = function(key) {
  // Check for empty string
  if (key === '!') {
    return '';
  }
  // 1. Replace exclamation marks with % to get URL encoded string
  // 2. URL decode (this handle step 1 and 2 from encoding process)
  return decodeURIComponent(key.replace(/!/g, '%'));
};

/******************** String Key ********************/

/** Construct a StringKey */
var StringKey = function(mapping, key) {
  // Set key
  this.key = key;

  // Set key type
  assert(mapping[this.key], 'key \'' + key + '\' is not defined in mapping');
  this.type = mapping[this.key];

  // Set covers
  this.covers = [key];
};

/** Construct exact key if possible */
StringKey.prototype.exact = function(properties) {
  // Get value
  var value = properties[this.key];
  // Check that value was given
  assert(value !== undefined, 'Unable to create key from properties');
  // Return exact key
  return encodeStringKey(this.type.string(value));
};

/** Construct exact key if possible */
StringKey.prototype.exactFromConditions = function(properties) {
  // Get value
  var value = valueFromOpOrValue(properties[this.key]);
  // Check that value was given
  assert(value !== undefined, 'Unable to create key from properties');
  // Return exact key
  return encodeStringKey(this.type.string(value));
};

/** Create StringKey builder */
exports.StringKey = function(key) {
  var keys = Array.prototype.slice.call(arguments);
  assert(keys.length === 1, 'StringKey takes exactly one key argument');
  assert(typeof key === 'string', 'StringKey takes a string as argument');
  return function(mapping) {
    return new StringKey(mapping, key);
  };
};

/******************** Descending Integer Key ********************/

// More nines than an int can hold, ie. MORE_NINES_THAN_INT > 2^32
// DescendingIntegerKey only works with PositiveInteger which is limited 2^32.
var MORE_NINES_THAN_INT = 9999999999;

/** Construct a DescendingIntegerKey */
var DescendingIntegerKey = function(mapping, key) {
  // Set key
  this.key = key;

  // Set key type
  assert(mapping[this.key], 'key \'' + key + '\' is not defined in mapping');
  assert(mapping[this.key] instanceof Types.PositiveInteger,
    'key \'' + key + '\' must be a PositiveInteger type');
  this.type = mapping[this.key];

  // Set covers
  this.covers = [key];
};

/** Construct exact key if possible */
DescendingIntegerKey.prototype.exact = function(properties) {
  // Get value
  var value = properties[this.key];
  // Check that value was given
  assert(value !== undefined, 'Unable to create key from properties');
  // Return exact key
  return (MORE_NINES_THAN_INT - value).toString();
};

/** Construct exact key if possible */
DescendingIntegerKey.prototype.exactFromConditions = function(properties) {
  // Get value
  var value = valueFromOpOrValue(properties[this.key]);
  // Check that value was given
  assert(value !== undefined, 'Unable to create key from properties');
  // Return exact key
  return (MORE_NINES_THAN_INT - value).toString();
};

/** Create DescendingIntegerKey builder */
exports.DescendingIntegerKey = function(key) {
  return function(mapping) {
    return new DescendingIntegerKey(mapping, key);
  };
};

/******************** Ascending Integer Key ********************/

// Padding for integers up to 2^32 be in ascending order. 
// AscendingIntegerKey only works with PositiveInteger which is limited 2^32.
var ASCENDING_KEY_PADDING = '00000000000';

/** Construct a AscendingIntegerKey */
var AscendingIntegerKey = function(mapping, key) {
  // Set key
  this.key = key;

  // Set key type
  assert(mapping[this.key], 'key \'' + key + '\' is not defined in mapping');
  assert(mapping[this.key] instanceof Types.PositiveInteger,
    'key \'' + key + '\' must be a PositiveInteger type');
  this.type = mapping[this.key];

  // Set covers
  this.covers = [key];
};

/** Construct exact key if possible */
AscendingIntegerKey.prototype.exact = function(properties) {
  // Get value
  var value = properties[this.key];
  // Check that value was given
  assert(value !== undefined, 'Unable to create key from properties');
  // Return exact key
  var str = value.toString();
  return ASCENDING_KEY_PADDING.substring(
    0, ASCENDING_KEY_PADDING.length - str.length
  ) + str;
};

/** Construct exact key if possible */
AscendingIntegerKey.prototype.exactFromConditions = function(properties) {
  // Get value
  var value = valueFromOpOrValue(properties[this.key]);
  // Check that value was given
  assert(value !== undefined, 'Unable to create key from properties');
  // Return exact key
  var str = value.toString();
  return ASCENDING_KEY_PADDING.substring(
    0, ASCENDING_KEY_PADDING.length - str.length
  ) + str;
};

/** Create AscendingIntegerKey builder */
exports.AscendingIntegerKey = function(key) {
  return function(mapping) {
    return new AscendingIntegerKey(mapping, key);
  };
};

/******************** Constant Key ********************/

/** Construct a ConstantKey */
var ConstantKey = function(constant) {
  assert(typeof constant === 'string', 'ConstantKey takes a string!');

  // Set constant
  this.constant = constant;
  this.encodedConstant = encodeStringKey(constant);

  // Set covers
  this.covers = [];
};

ConstantKey.prototype.exact = function(properties) {
  return this.encodedConstant;
};

ConstantKey.prototype.exactFromConditions = function(properties) {
  return this.encodedConstant;
};

exports.ConstantKey = function(constant) {
  assert(typeof constant === 'string', 'ConstantKey takes a string!');
  return function(mapping) {
    return new ConstantKey(constant);
  };
};

/******************** Composite Key ********************/

// Separator for use in Composite keys (don't change this)
// Note, that tilde is the last character, we can exploit this when we decide to
// implement prefix matching for rowKeys.
var COMPOSITE_SEPARATOR = '~';

/** Construct a CompositeKey */
var CompositeKey = function(mapping, keys) {
  assert(keys instanceof Array, 'keys must be an array');
  assert(keys.length > 0, 'CompositeKey needs at least one key');

  // Set keys
  this.keys = keys;

  // Set key types
  this.types = [];
  for (var i = 0; i < keys.length; i++) {
    assert(mapping[keys[i]], 'key \'' + keys[i] + '\' is not defined in mapping');
    this.types[i] = mapping[keys[i]];
  }

  // Set covers
  this.covers = keys;
};

CompositeKey.prototype.exact = function(properties) {
  // Map each key to it's string encoded value
  return this.keys.map(function(key, index) {
    // Get value from key
    var value = properties[key];
    if (value === undefined) {
      throw new Error('Unable to render CompositeKey from properties, ' +
                      'missing: \'' + key + '\'');
    }

    // Encode as string
    return encodeStringKey(this.types[index].string(value));
  }, this).join(COMPOSITE_SEPARATOR); // Join with separator
};

CompositeKey.prototype.exactFromConditions = function(properties) {
  // Map each key to it's string encoded value
  return this.keys.map(function(key, index) {
    // Get value from key
    var value = valueFromOpOrValue(properties[key]);
    if (value === undefined) {
      throw new Error('Unable to render CompositeKey from properties, ' +
                      'missing: \'' + key + '\'');
    }

    // Encode as string
    return encodeStringKey(this.types[index].string(value));
  }, this).join(COMPOSITE_SEPARATOR); // Join with separator
};

exports.CompositeKey = function() {
  var keys = Array.prototype.slice.call(arguments);
  keys.forEach(function(key) {
    assert(typeof key === 'string', 'CompositeKey takes strings as arguments');
  });
  return function(mapping) {
    return new CompositeKey(mapping, keys);
  };
};

/******************** Hash Key ********************/

// Check that crypto has support for sha512
assert(crypto.getHashes().indexOf('sha512') !== -1,
  'crypto doesn\'t support sha512, please upgrade OpenSSL');

// Separator used to separate entries in hash key (don't change this)
var HASH_KEY_SEPARATOR = ':';

/** Construct a HashKey */
var HashKey = function(mapping, keys) {
  assert(keys instanceof Array, 'keys must be an array');
  assert(keys.length > 0, 'HashKey needs at least one key');

  // Set keys
  this.keys = keys;

  // Set key types
  this.types = [];
  for (var i = 0; i < keys.length; i++) {
    assert(mapping[keys[i]], 'key \'' + keys[i] + '\' is not defined in mapping');
    this.types[i] = mapping[keys[i]];
  }

  // Set covers
  this.covers = keys;
};

HashKey.prototype.exact = function(properties) {
  var hash =  crypto.createHash('sha512');
  var n = this.keys.length;
  for (var i = 0; i < n; i++) {
    var key = this.keys[i];

    // Get value from key
    var value = properties[key];
    if (value === undefined) {
      throw new Error('Unable to render HashKey from properties, ' +
                      'missing: \'' + key + '\'');
    }

    // Find hash value and update the hashsum
    hash.update(this.types[i].hash(value), 'utf8');

    // Insert separator, if this isn't the last key
    if (i + 1 < n) {
      hash.update(HASH_KEY_SEPARATOR, 'utf8');
    }
  }

  return hash.digest('hex');
};

HashKey.prototype.exactFromConditions = function(properties) {
  var hash =  crypto.createHash('sha512');
  var n = this.keys.length;
  for (var i = 0; i < n; i++) {
    var key = this.keys[i];

    // Get value from key
    var value = valueFromOpOrValue(properties[key]);
    if (value === undefined) {
      throw new Error('Unable to render HashKey from properties, ' +
                      'missing: \'' + key + '\'');
    }

    // Find hash value and update the hashsum
    hash.update(this.types[i].hash(value), 'utf8');

    // Insert separator, if this isn't the last key
    if (i + 1 < n) {
      hash.update(HASH_KEY_SEPARATOR, 'utf8');
    }
  }

  return hash.digest('hex');
};

exports.HashKey = function() {
  var keys = Array.prototype.slice.call(arguments);
  keys.forEach(function(key) {
    assert(typeof key === 'string', 'HashKey takes strings as arguments');
  });
  return function(mapping) {
    return new HashKey(mapping, keys);
  };
};
