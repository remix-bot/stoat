# WIP Web Dashboard for Remix

Control Remix through a web interface and set server settings and similar.

Installation instructions will follow soon:tm:

## Setup

1. Create a mysql server with the following table:
  ```MySQL
  CREATE TABLE `ksiTokens` (
  `user` varchar(26) NOT NULL,
  `id` varchar(50) NOT NULL,
  `token` varchar(70) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `createdAt` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

CREATE TABLE `logins` (
  `user` text NOT NULL,
  `id` varchar(50) NOT NULL,
  `token` varchar(70) NOT NULL,
  `verified` tinyint(1) NOT NULL,
  `createdAt` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
  ```
2. Fill out the connection details in `config.json` in the remix root directory (See `config.example.json`)
3. SSL setup:
  - Create a certificate. For example [using Let's Encrypt](https://letsencrypt.org/de/getting-started/)
  - Find the path to your private key and certificate pem files. Certbot uses `/etc/letsencrypt/live/remix.fairuse.org/privkey.pem` for the private key and `/etc/letsencrypt/live/remix.fairuse.org/fullchain.pem` for the certificate file. Fill in the paths in the config file
  - set `useSSL` in `config.json` to `true`
  - Make sure to configure the ports correctly. HTTPS connects to port `443` so make sure to set `webPort` accordingly.

Credits for Website design:
- NoLogicAlan 
- ophx
- ShadowLp174
- Fantic
