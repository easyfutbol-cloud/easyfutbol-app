-- MySQL dump 10.13  Distrib 9.4.0, for macos15.4 (arm64)
--
-- Host: localhost    Database: easyfutbol
-- ------------------------------------------------------
-- Server version	9.4.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `fields`
--

DROP TABLE IF EXISTS `fields`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fields` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `city` varchar(120) NOT NULL,
  `address` varchar(190) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fields`
--

LOCK TABLES `fields` WRITE;
/*!40000 ALTER TABLE `fields` DISABLE KEYS */;
INSERT INTO `fields` VALUES (1,'Ribera de Castilla','Valladolid','Paseo del Renacimiento 12','2025-09-29 19:22:36'),(2,'Rondilla','Valladolid','C/ Real 5','2025-09-29 19:22:36'),(3,'Ribera de Castilla','Valladolid',NULL,'2025-09-29 21:26:13'),(4,'Rondilla','Valladolid',NULL,'2025-09-29 21:26:13'),(5,'La Palomera','León',NULL,'2025-09-29 21:26:13'),(6,'Ventanielles','Oviedo',NULL,'2025-09-29 21:26:13');
/*!40000 ALTER TABLE `fields` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inscripciones`
--

DROP TABLE IF EXISTS `inscripciones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inscripciones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int DEFAULT NULL,
  `partido_id` int DEFAULT NULL,
  `fecha_inscripcion` datetime DEFAULT CURRENT_TIMESTAMP,
  `pago_realizado` tinyint(1) DEFAULT '0',
  `fue_mvp` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `fk_usuario` (`usuario_id`),
  KEY `fk_partido` (`partido_id`),
  CONSTRAINT `fk_partido` FOREIGN KEY (`partido_id`) REFERENCES `partidos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `inscripciones_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `inscripciones_ibfk_2` FOREIGN KEY (`partido_id`) REFERENCES `partidos` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inscripciones`
--

LOCK TABLES `inscripciones` WRITE;
/*!40000 ALTER TABLE `inscripciones` DISABLE KEYS */;
/*!40000 ALTER TABLE `inscripciones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inscriptions`
--

DROP TABLE IF EXISTS `inscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `match_id` int NOT NULL,
  `status` enum('pending','confirmed','cancelled') DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `stripe_session_id` varchar(120) DEFAULT NULL,
  `goals` int DEFAULT '0',
  `assists` int DEFAULT '0',
  `ticket_type` enum('white','black') NOT NULL DEFAULT 'white',
  PRIMARY KEY (`id`),
  KEY `match_id` (`match_id`),
  KEY `idx_stripe_session` (`stripe_session_id`),
  KEY `idx_user_match` (`user_id`,`match_id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inscriptions`
--

LOCK TABLES `inscriptions` WRITE;
/*!40000 ALTER TABLE `inscriptions` DISABLE KEYS */;
INSERT INTO `inscriptions` VALUES (4,1,3,'confirmed','2026-02-02 19:29:30','cs_test_a10lA2cOMm8o5zIWo1Noo6LCauKwmk731HjMxAOyXepD7WqBCfpuH1KCv9',0,0,'white'),(10,1,3,'confirmed','2026-02-03 08:57:14','cs_test_a1j7dW9JLiSjJKU4bbo0QGqwj90b6zuSMScm7LDp5KwTN0hxeetYOZZpye',0,0,'white'),(11,1,3,'confirmed','2026-02-03 09:13:35','cs_test_a1dDjF2A0890MRYNojmzcQKhFyRNfgrpy4PWUNaepYYQXwarOrqVu22jRV',0,0,'white'),(12,1,3,'confirmed','2026-02-03 09:14:28','cs_test_a1dDjF2A0890MRYNojmzcQKhFyRNfgrpy4PWUNaepYYQXwarOrqVu22jRV',0,0,'white'),(13,1,3,'confirmed','2026-02-03 09:14:28','cs_test_a1dDjF2A0890MRYNojmzcQKhFyRNfgrpy4PWUNaepYYQXwarOrqVu22jRV',0,0,'white'),(14,1,3,'confirmed','2026-02-03 09:14:28','cs_test_a1dDjF2A0890MRYNojmzcQKhFyRNfgrpy4PWUNaepYYQXwarOrqVu22jRV',0,0,'white'),(15,1,3,'confirmed','2026-02-03 09:14:28','cs_test_a1dDjF2A0890MRYNojmzcQKhFyRNfgrpy4PWUNaepYYQXwarOrqVu22jRV',0,0,'white'),(16,1,3,'confirmed','2026-02-03 09:14:28','cs_test_a1dDjF2A0890MRYNojmzcQKhFyRNfgrpy4PWUNaepYYQXwarOrqVu22jRV',0,0,'white');
/*!40000 ALTER TABLE `inscriptions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `match_player_stats`
--

DROP TABLE IF EXISTS `match_player_stats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `match_player_stats` (
  `id` int NOT NULL AUTO_INCREMENT,
  `match_id` int NOT NULL,
  `user_id` int NOT NULL,
  `goals` tinyint unsigned NOT NULL DEFAULT '0',
  `assists` tinyint unsigned NOT NULL DEFAULT '0',
  `is_mvp` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_match_player` (`match_id`,`user_id`),
  KEY `fk_mps_user` (`user_id`),
  CONSTRAINT `fk_mps_match` FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mps_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `match_player_stats`
--

LOCK TABLES `match_player_stats` WRITE;
/*!40000 ALTER TABLE `match_player_stats` DISABLE KEYS */;
/*!40000 ALTER TABLE `match_player_stats` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `matches`
--

DROP TABLE IF EXISTS `matches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `matches` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(140) NOT NULL,
  `field_id` int NOT NULL,
  `city` varchar(120) NOT NULL,
  `starts_at` datetime NOT NULL,
  `duration_min` int NOT NULL DEFAULT '60',
  `price_eur` decimal(6,2) NOT NULL DEFAULT '0.00',
  `capacity` int NOT NULL DEFAULT '14',
  `spots_taken` int NOT NULL DEFAULT '0',
  `status` enum('scheduled','full','cancelled') DEFAULT 'scheduled',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `white_capacity` tinyint unsigned NOT NULL DEFAULT '8',
  `black_capacity` tinyint unsigned NOT NULL DEFAULT '8',
  `white_taken` tinyint unsigned NOT NULL DEFAULT '0',
  `black_taken` tinyint unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `field_id` (`field_id`),
  CONSTRAINT `matches_ibfk_1` FOREIGN KEY (`field_id`) REFERENCES `fields` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `matches`
--

LOCK TABLES `matches` WRITE;
/*!40000 ALTER TABLE `matches` DISABLE KEYS */;
INSERT INTO `matches` VALUES (1,'Partido Miércoles Noche',1,'Valladolid','2025-10-01 21:22:36',60,3.90,14,6,'scheduled','2025-09-29 19:22:36',8,8,0,0),(2,'Partido Sábado Mañana',2,'Valladolid','2025-10-03 21:22:36',60,3.90,14,12,'scheduled','2025-09-29 19:22:36',8,8,0,0),(3,'15 de febrero',1,'Valladolid','2026-02-15 20:00:00',60,3.90,16,8,'scheduled','2026-02-02 18:28:14',8,8,0,0);
/*!40000 ALTER TABLE `matches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `partidos`
--

DROP TABLE IF EXISTS `partidos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `partidos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fecha` date NOT NULL,
  `hora_inicio` time NOT NULL,
  `hora_fin` time NOT NULL,
  `lugar` varchar(255) NOT NULL,
  `precio` decimal(5,2) NOT NULL,
  `plazas_disponibles` int NOT NULL,
  `plazas_ocupadas` int DEFAULT '0',
  `estado` enum('abierto','completo','cancelado','finalizado') DEFAULT 'abierto',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `partidos`
--

LOCK TABLES `partidos` WRITE;
/*!40000 ALTER TABLE `partidos` DISABLE KEYS */;
/*!40000 ALTER TABLE `partidos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `teams`
--

DROP TABLE IF EXISTS `teams`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `teams` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) DEFAULT NULL,
  `captain_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `captain_id` (`captain_id`),
  CONSTRAINT `teams_ibfk_1` FOREIGN KEY (`captain_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `teams`
--

LOCK TABLES `teams` WRITE;
/*!40000 ALTER TABLE `teams` DISABLE KEYS */;
/*!40000 ALTER TABLE `teams` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) DEFAULT NULL,
  `email` varchar(190) DEFAULT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `role` enum('player','admin') DEFAULT 'player',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `avatar_url` varchar(255) DEFAULT NULL,
  `push_token` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Roberto','roberto@test.com','$2b$10$ZMaNbMShPpUCDaiMXv1LzujpeMPdOnlt7MqH/MiJRyFhfHS6JnJvq','admin','2025-09-29 19:08:46','/uploads/avatars/user-1.jpg',NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `usuarios`
--

DROP TABLE IF EXISTS `usuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuarios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `fecha_registro` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `rol` enum('jugador','admin') DEFAULT 'jugador',
  `mvp_ganados` int DEFAULT '0',
  `goles` int DEFAULT '0',
  `push_token` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `usuarios`
--

LOCK TABLES `usuarios` WRITE;
/*!40000 ALTER TABLE `usuarios` DISABLE KEYS */;
INSERT INTO `usuarios` VALUES (3,'Admin','admin@easyfutbol.es','$2b$10$MFzfQVfNiUNq5LKCFGU2Zu08xAYyAedeCPeXeShM/09Bj5d2MPJmW','2025-06-21 13:45:42','admin',0,0,'ExponentPushToken[rJizb2MsZXpVaX7BK11R42]'),(4,'Prueba','prueba','$2b$10$tCxItLt7bj1LX.HPdMfYye2WkybrF1jKIVPegEZNk3tLr/fij3OUK','2025-06-21 17:17:02','admin',0,0,'ExponentPushToken[rJizb2MsZXpVaX7BK11R42]');
/*!40000 ALTER TABLE `usuarios` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-03 20:07:53
