
/**
 * Module dependencies.
 */

var InvalidArgumentError = require('oauth2-server/lib/errors/invalid-argument-error');
var NodeOAuthServer = require('oauth2-server');
var Request = require('oauth2-server').Request;
var Response = require('oauth2-server').Response;
var UnauthorizedRequestError = require('oauth2-server/lib/errors/unauthorized-request-error');
var co = require('co');

/**
 * Constructor.
 */

function KoaOAuthServer(options) {
  options = options || {};

  if (!options.model) {
    throw new InvalidArgumentError('Missing parameter: `model`');
  }

  for (var fn in options.model) {
    options.model[fn] = co.wrap(options.model[fn]);
  }

  this.server = new NodeOAuthServer(options);
}

/**
 * Authentication Middleware.
 *
 * Returns a middleware that will validate a token.
 *
 * (See: https://tools.ietf.org/html/rfc6749#section-7)
 */

KoaOAuthServer.prototype.authenticate = function(options) {
  var server = this.server;

  return function *(next) {
    var request = new Request(this.request);
    var response = new Response(this.response);

    try {
      this.state.oauth = {
        token: yield server.authenticate(request, response, options)
      };
    } catch (e) {
      return handleError.call(this, e);
    }

    yield* next;
  };
};

/**
 * Authorization Middleware.
 *
 * Returns a middleware that will authorize a client to request tokens.
 *
 * (See: https://tools.ietf.org/html/rfc6749#section-3.1)
 */

KoaOAuthServer.prototype.authorize = function(options) {
  var server = this.server;

  return function *(next) {
    var request = new Request(this.request);
    var response = new Response(this.response);

    try {
      this.state.oauth = {
        code: yield server.authorize(request, response, options)
      };

      handleResponse.call(this, response);
    } catch (e) {
      return handleError.call(this, e, response);
    }

    yield* next;
  };
};

/**
 * Grant Middleware
 *
 * Returns middleware that will grant tokens to valid requests.
 *
 * (See: https://tools.ietf.org/html/rfc6749#section-3.2)
 */

KoaOAuthServer.prototype.token = function(options) {
  var server = this.server;

  return function *(next) {
    var request = new Request(this.request);
    var response = new Response(this.response);

    try {
      this.state.oauth = {
        token: yield server.token(request, response, options)
      };

      handleResponse.call(this, response);
    } catch (e) {
      return handleError.call(this, e, response);
    }

    yield* next;
  };
};

/**
 * Handle response.
 */

var handleResponse = function(response) {
  this.body = response.body;
  this.status = response.status;

  this.set(response.headers);
};

/**
 * Handle error.
 */

var handleError = function(e, response) {
  if (response) {
    this.set(response.headers);
  }

  if (e instanceof UnauthorizedRequestError) {
    this.status = e.code;
  } else {
    this.body = { error: e.name, error_description: e.message };
    if (e.expose) {
      Object.keys(e).forEach(function (key) {
        if (key === 'name' || key === 'code' || key === 'message' ||
            key === 'status' || key === 'expose') return;
        this.body[key] = e[key];
      }.bind(this));
    }
    this.status = e.code;
  }

  return (this.status >= 400 && this.status < 500) || this.app.emit('error', e, this);
};

/**
 * Export constructor.
 */

module.exports = KoaOAuthServer;
