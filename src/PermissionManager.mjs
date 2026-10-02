import { Client } from "revolt.js";
import { Message } from "./MessageHandler.mjs";

export class CommandRequirement {
  /**
   * @callback VerificationHandler
   * @param {Message} message
   * @returns {Promise<boolean>}
   */
  /** @type {VerificationHandler} */
  verify;
  /** @type {string} */
  error;

  ownerOnly = false;

  /** @type {CommandRequirement[]} */
  required;
  /** @type {CommandRequirement[]} */
  fallbacks;

  constructor() {
    this.required = [];
    this.fallbacks = [];

    this.error = "You don't have the needed permissions to run this command!";
  }

  /**
   * @param {boolean} bool
   */
  setOwnerOnly(bool) {
    this.ownerOnly = bool;
    return this;
  }

  /**
   * Chain further requirements to this one. Equivalent to a logical AND: both requirements must be satisfied to be valid.
   * Requirements will be evaluated minimally in order, i.e. the first negative result will stop the evaluation.
   * @param {CommandRequirement} req
   * @returns {CommandRequirement}
   */
  and(req) {
    this.required.push(req);
    return this;
  }
  /**
   * Logical OR: If this requirement is not satisfied, at least one of the chained requirements suffices.
   * Evaluated minimally in order.
   * @param {CommandRequirement} req
   * @returns {CommandRequirement}
   */
  or(req) {
    //throw "Abstract class. Not implemented";
    this.fallbacks.push(req);
    return this;
  }

  /**
   * Verifies this and all attached requirements in order:
   *  If this requirement evaluates to `true`, all the required requirements (added by .and())
   *  are evaluated in order of attachment. If any call fails, the evaluation stops and fallbacks are tried.
   *
   *  If during any of those previous steps any requirement failed, fallbacks are attempted.
   *  All attached requirements are evauated in order, stopping at the first success.
   *
   * @param {Message} msg
   */
  async verifyRequirement(msg) {
    var res = await this.verify(msg);
    if ((this.required.length > 0) && res) {
      for (const req of this.required) {
        res = res && (await req.verify(msg));
        if (!res) break;
      }
    }
    if ((this.fallbacks.length > 0) && !res) {
      for (const req of this.fallbacks) {
        res = res || (await req.verify(msg));
        if (res) break;
      }
    }
    return res;
  }
}

export class PermissionBuilder extends CommandRequirement {
  type = "system";
  /** @type {string} */
  permission;
  /** @type {PermissionBuilder} */
  fallback;
  /**
   * @callback VerificationHandler
   * @param {Message} message
   * @returns {Promise<boolean>}
   */
  /** @type {VerificationHandler} */
  verify;
  /**
   * @param {("system"|"custom")} [type]
   */
  constructor(type = "system") {
    super();
    this.type = type;

    this.error = "You don't have the needed permissions to run this command!";
  }
  /**
   * @param {string} perm
   * @param {Message} msg
   * @returns {boolean}
   */
  static validateSystemPerms(perm, msg) {
    const member = msg.member;
    if (perm === "Owner-only command") return PermissionBuilder.owners.includes(msg.author.id);
    return member.hasPermission(perm) || PermissionManager.owners.includes(msg.author.id);
  }
  /**
   * @param {string} permission
   * @returns {PermissionBuilder}
   */
  setPermission(permission) {
    this.permission = permission;
    if (this.type === "system") {
      this.setVerificationHandler(PermissionBuilder.validateSystemPerms.bind(this, this.permission));
    }
    return this;
  }
  /**
   * @param {VerificationHandler} handler
   * @returns {PermissionBuilder}
   */
  setVerificationHandler(handler) {
    this.verify = handler;
    return this;
  }

  /**
   * Fallback permissions that are also authorised to perform this action.
   * e.g.
   *    `ManageServer` --> `Mod Role`
   * A user with the ManageServer permissions is allowed to skip songs without a vote,
   * but if a user doesn't have this permission, it has to own the "Mod Role".
   *
   * @param {PermissionBuilder} fallback
   */
  /*or(fallback) {
    this.fallback = fallback;
  }*/
}

export class RoleRequirement extends CommandRequirement {
  /**
   * @param {string} name
   * @param {string} id
   */
  constructor(name, id) {
    super();
    this.setPermission(`Role: ${name}`);

    this.id = id;
    this.name = name;
    this.setVerificationHandler((msg) => {
      if (msg.server.isGroup) return false;
      return msg.member.roles.includes(this.id);
    });
  }
}

export class PermissionManager {
  client;

  // NOTE: Edit this for custom deployments according to your own user ids
  static owners = ["01G9MCW5KZFKT2CRAD3G3B9JN5"];

  /**
   * @param {Client} client
   */
  constructor(client) {
    this.client = client;
  }

  /**
   * @param {Message} msg
   * @param {PermissionBuilder} permission
   */
  async validate(msg, permission) {
    return await permission.verifyRequirement(msg);
  }

  /**
   * @param {VerificationHandler} handler
   * @param {string} permName
   * @returns {PermissionBuilder}
   */
  static customPermission(handler, permName) {
    return new PermissionBuilder("custom")
      .setPermission(permName)
      .setVerificationHandler(handler);
  }
  /**
   * @param {string} permission Stoat Permission String, or `Owner-only command` for debug or test commands
   * @returns {PermissionBuilder}
   */
  static systemPermission(permission) {
    return new PermissionBuilder("system").setPermission(permission);
  }
}
