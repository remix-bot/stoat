import { Client } from "revolt.js";
import { Message } from "./MessageHandler.mjs";

export class PermissionBuilder {
  type = "system";
  /** @type {string} */
  permission;
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
  constructor(type="system") {
    this.type = type;
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
  async getApproval(msg, permission) {
    return await permission.verify(msg);
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
