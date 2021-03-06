const _ = require("lodash");
const path = require("path");
const crimson = require("crimson");
const DiscordClient = require("discord.io");

const core = require('./core.js');
const keychain = require('./keychain.js');

var discord = new DiscordClient({
    autorun: true,
    email: keychain.email,
    password: keychain.passwd
});

const wrongType = (part, command, key) => crimson.fatal("Incorrect type for " + part + " in command " + command + " at key " + key + ".");

try {
    const config = require(path.join(__dirname, "config.json"));
    if (typeof config.sign !== "string" || typeof config.debug !== "boolean") crimson.fatal("Configuration of 'sign' and/or 'debug' is incorrect.");
    const commands = config.commands;
    if (!(commands instanceof Array)) crimson.fatal("Section `commands` should be an array.");

    _.each(commands, (command, key) => {
        if (typeof command.command !== "string") crimson.fatal("Missing command name ['command'] at key " + key + ".");
        if (typeof command.desc !== "string") wrongType("description ['desc']", command.command, key);
        if (!(config.masters instanceof Array)) wrongType("masters ['masters']", command.command, key);
        if (!(command.args instanceof Array)) wrongType("alias ['alias']", command.command, key);
        if (!(command.args instanceof Array)) wrongType("arguments ['args']", command.command, key);
        _.each(config.subprocesses, (v, key) => { if (typeof v !== "string") wrongType("subprocess ['subprocess']", "subprocesses", key); if (v.startsWith(config.sign)) crimson.fatal("Unfortunately, commands cannot start with the bot sign due to compatibility reasons.");});
        _.each(command.alias, (v, key) => { if (typeof v !== "string") wrongType("alias ['alias']", command.command, key); });
        _.each(command.args, (v, key) => { if (!(v instanceof Array)) wrongType("arguments ['args']", command.command, key); });
    });

} catch(e) {
    crimson.error("Failed to start. Either config.json is not present, corrupted or missing arguments.");
    crimson.fatal("Error: " + e);
}

discord.on("ready", () => {
    crimson.info(discord.username + " ready.");

    _.each(config.subprocesses, (v) => {
        try {
            var subprocess = require(path.join(__dirname, "subprocesses", v + ".js"));
            subprocess.main(discord, config, __dirname);
        } catch(e) {
            crimson.error("Failed to start subprocess '" + v + "'.");
            crimson.fatal("Error: " + e);
        }
    });
});

discord.on("message", (user, userID, channel, text, rawEvent) => {
    if (discord.id === userID) return;
    crimson.info(user + ': ' + text);

    if (text.startsWith(config.sign)) {
        var args = text.split(" ");
        var command = args.splice(0, 1)[0].toLowerCase();

        if (command.startsWith(config.sign)) command = command.slice(config.sign.length);
        try {
            var matchedAlias = _.map(_.filter(commands, {alias: [command]}), "command");
            var originalCommand = command;

            if (matchedAlias.length > 0) command = matchedAlias[0];
            var matched = _.filter(commands, {command: command});
            if (matched.length > 0) {
                matched = matched[0];

                var supportedArgs = [];
                _.each(matched.args, (v) => {
                    supportedArgs.push(v.length);
                });

                if (matched.args.length === 0 || supportedArgs.indexOf(args.length) !== -1) {
                    var others = {config: config, command: originalCommand, masters: config.masters};
                    var module = require(path.join(__dirname, "commands", command + ".js"));
                    module.main(discord, channel, user, args, rawEvent.d.id, others);
                    return;
                }
            }
        } catch(e) {
            discord.sendMessage({
                to: channel,
                message: "Failed to run command `" + command + "`. Here's what Na-nose: ```" + e + "```"
            });
        }
    }

    var reactOrGifMatched = false;

    _.each(text.split(" "), (part) => {
        if(reactOrGifMatched) return false;
        if (part.startsWith(config.sign)) part = part.slice(config.sign.length).toLowerCase();
        else return;

        // Reacts.
        if (typeof config.reacts[part] === "string") {
            discord.sendMessage({
                to: channel,
                message: user + ': ' + config.reacts[part]
            });

            if (text === config.sign + part) core.delMsg(discord, channel, rawEvent.d.id);

            reactOrGifMatched = true;
        }

        // Gifs.
        else if (typeof config.gifs[part] === "string") {
            discord.sendMessage({
                to: channel,
                message: user + ': ' + config.gifs[part]
            });

            if (text === config.sign + part) core.delMsg(discord, channel, rawEvent.d.id);

            reactOrGifMatched = true;
        }
    });
});
