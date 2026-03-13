module.exports = {
  /*voteSkip: function(value) {

  }*/
  prefix: function(value, data) {
    //this.handler.setCustomPrefix(data.msg.channel.serverId, value);
  },
  pfp: function(value, data) {
    if (!data.msg.channel.server.havePermission("Masquerade") && value != "default") {
      return "Insufficient permission! I need the `Masquerade` perms to be able to do this!";
    }
  }
}
