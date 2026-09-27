import SwiftUI
import UIKit

private let smashCharacterAssetFileNames: [String: String] = [
    "Bayonetta": "bayonetta",
    "Bowser Jr.": "bowser_jr",
    "Bowser": "bowser",
    "Captain Falcon": "captain_falcon",
    "Cloud": "cloud",
    "Corrin": "corrin",
    "Daisy": "daisy",
    "Dark Pit": "dark_pit",
    "Diddy Kong": "diddy_kong",
    "Donkey Kong": "donkey_kong",
    "Dr. Mario": "dr_mario",
    "Duck Hunt": "duck_hunt",
    "Falco": "falco",
    "Fox": "fox",
    "Ganondorf": "ganondorf",
    "Greninja": "greninja",
    "Ice Climbers": "ice_climbers",
    "Ike": "ike",
    "Inkling": "inkling",
    "Jigglypuff": "jigglypuff",
    "King Dedede": "king_dedede",
    "Kirby": "kirby",
    "Link": "link",
    "Little Mac": "little_mac",
    "Lucario": "lucario",
    "Lucas": "lucas",
    "Lucina": "lucina",
    "Luigi": "luigi",
    "Mario": "mario",
    "Marth": "marth",
    "Mega Man": "mega_man",
    "Meta Knight": "meta_knight",
    "Mewtwo": "mewtwo",
    "Mii Brawler": "mii_fighter",
    "Mii Swordfighter": "mii_fighter",
    "Mii Gunner": "mii_fighter",
    "Ness": "ness",
    "Olimar": "olimar",
    "Pac-Man": "pac_man",
    "Palutena": "palutena",
    "Peach": "peach",
    "Pichu": "pichu",
    "Pikachu": "pikachu",
    "Pit": "pit",
    "Pokemon Trainer": "pokemon_trainer",
    "Ridley": "ridley",
    "R.O.B.": "rob",
    "Robin": "robin",
    "Rosalina": "rosalina_and_luma",
    "Roy": "roy",
    "Ryu": "ryu",
    "Samus": "samus",
    "Sheik": "sheik",
    "Shulk": "shulk",
    "Snake": "snake",
    "Sonic": "sonic",
    "Toon Link": "toon_link",
    "Villager": "villager",
    "Wario": "wario",
    "Wii Fit Trainer": "wii_fit_trainer",
    "Wolf": "wolf",
    "Yoshi": "yoshi",
    "Young Link": "young_link",
    "Zelda": "zelda",
    "Zero Suit Samus": "zero_suit_samus",
    "Mr. Game & Watch": "mr_game_and_watch",
    "Incineroar": "incineroar",
    "King K. Rool": "king_k_rool",
    "Dark Samus": "dark_samus",
    "Chrom": "chrom",
    "Ken": "ken",
    "Simon Belmont": "simon",
    "Richter": "richter",
    "Isabelle": "isabelle",
    "Piranha Plant": "piranha_plant",
    "Joker": "joker",
    "Hero": "hero",
    "Banjo-Kazooie": "banjo_kazooie",
    "Terry": "terry",
    "Byleth": "byleth",
    "Min Min": "min_min",
    "Steve": "steve",
    "Sephiroth": "sephiroth",
    "Pyra & Mythra": "pyra",
    "Kazuya": "kazuya",
    "Sora": "sora",
]

private func smashCharacterUIImage(name: String) -> UIImage? {
    if ["Zetterburn", "Orcane", "Wrastor", "Kragg", "Forsburn", "Maypul", "Absa", "Etalus", "Ranno", "Clairen", "Olympia", "Fleet", "Loxodont", "Galvan", "La Reina", "Slade"].contains(name),
       let url = Bundle.main.url(forResource: name.lowercased().replacingOccurrences(of: " ", with: "_"), withExtension: "png", subdirectory: "roa2-stock-icons") {
        return UIImage(contentsOfFile: url.path)
    }
    guard let fileName = smashCharacterAssetFileNames[name] else {
        return nil
    }

    if let image = UIImage(named: fileName) {
        return image
    }

    if let url = Bundle.main.url(forResource: fileName, withExtension: "png", subdirectory: "smash-stock-icons"),
       let image = UIImage(contentsOfFile: url.path) {
        return image
    }

    if let url = Bundle.main.url(forResource: fileName, withExtension: "png"),
       let image = UIImage(contentsOfFile: url.path) {
        return image
    }

    return nil
}

struct SmashCharacterIcon: View {
    let name: String
    var size: CGFloat = 24

    var body: some View {
        Group {
            if let image = smashCharacterUIImage(name: name) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
            } else {
                ZStack {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color.secondary.opacity(0.18))
                    Text(String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1)).uppercased())
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}

struct SmashCharacterInlineLabel: View {
    let name: String
    var iconSize: CGFloat = 24
    var textColor: Color = .primary

    var body: some View {
        HStack(spacing: 8) {
            SmashCharacterIcon(name: name, size: iconSize)
            Text(name)
                .foregroundStyle(textColor)
                .lineLimit(1)
        }
    }
}
