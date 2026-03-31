from manim import *
import numpy as np

BG = "#0D1117"
PRIMARY = "#58C4DD"
SECONDARY = "#83C167"
ACCENT = "#FFFF00"
HIGHLIGHT = "#FF6B6B"
SUBTLE = "#333340"
DIM = "#666677"
FONT = "SF Pro Display"
MONO = "Menlo"
DUR = [2.95, 5.33, 7.29, 5.46, 5.56, 6.30, 6.09, 3.66]


class Scene1_Title(Scene):
    """Minimal title card with animated geometry. 2.95s"""
    def construct(self):
        self.camera.background_color = BG

        # Animated geometric backdrop
        shapes = Group()
        for i in range(5):
            s = RegularPolygon(n=3 + i, color=PRIMARY, stroke_width=1.0, stroke_opacity=0.1 + i * 0.04)
            s.scale(0.5 + i * 0.5).rotate(i * PI / 7)
            shapes.add(s)

        self.play(LaggedStart(*[Create(s) for s in shapes], lag_ratio=0.1, run_time=1.0))
        self.play(*[s.animate.set_stroke(opacity=0.03) for s in shapes], run_time=0.3)

        title = Text("Manim Skill", font_size=56, color=PRIMARY, weight=BOLD, font=FONT)
        sub = Text("HERMES AGENT", font_size=16, color=DIM, font=MONO).next_to(title, UP, buff=0.3)
        self.play(FadeIn(sub, shift=DOWN * 0.1), Write(title), run_time=1.0)
        self.wait(1.1)
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.4)


class Scene2_Pipeline(Scene):
    """Animated pipeline nodes lighting up. 5.33s"""
    def construct(self):
        self.camera.background_color = BG

        stages = ["PLAN", "CODE", "RENDER", "STITCH", "REVIEW"]
        colors = [HIGHLIGHT, ACCENT, PRIMARY, SECONDARY, WHITE]

        nodes = Group()
        for stage, color in zip(stages, colors):
            dot = Circle(radius=0.25, color=color, fill_opacity=0.0, stroke_width=2)
            label = Text(stage, font_size=14, color=color, font=MONO).next_to(dot, DOWN, buff=0.2)
            nodes.add(Group(dot, label))

        nodes.arrange(RIGHT, buff=1.0).move_to(ORIGIN)

        lines = Group()
        for i in range(len(nodes) - 1):
            line = Line(
                nodes[i][0].get_right(), nodes[i + 1][0].get_left(),
                color=SUBTLE, stroke_width=1.5
            )
            lines.add(line)

        self.add(lines)

        # Light up each node sequentially with a pulse
        for i, node in enumerate(nodes):
            self.play(
                FadeIn(node, scale=0.8),
                node[0].animate.set_fill(opacity=0.3),
                run_time=0.4
            )
            if i < len(lines):
                self.play(
                    lines[i].animate.set_color(colors[i]).set_stroke(width=2.5),
                    run_time=0.2
                )

        self.wait(0.5)

        # Pulse wave through all nodes
        for _ in range(2):
            for i, node in enumerate(nodes):
                self.play(
                    node[0].animate.set_fill(opacity=0.6),
                    run_time=0.08
                )
                self.play(
                    node[0].animate.set_fill(opacity=0.2),
                    run_time=0.08
                )

        self.wait(0.8)
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.4)


class Scene3_Modes(Scene):
    """Visual demos of what you can create — actual animations, not labels. 7.29s"""
    def construct(self):
        self.camera.background_color = BG

        # Demo 1: Equation transform (left side)
        eq1 = Text("f(x) = x²", font_size=28, color=ACCENT, font=MONO)
        eq2 = Text("f(x) = 2x", font_size=28, color=SECONDARY, font=MONO)
        eq1.shift(LEFT * 3 + UP * 2)
        eq2.move_to(eq1)

        # Demo 2: Sorting bars (center)
        values = [3, 7, 2, 5, 8, 1, 6, 4]
        bars = Group(*[
            Rectangle(width=0.3, height=v * 0.3, color=PRIMARY,
                     fill_opacity=0.4 + v * 0.06, stroke_width=1)
            for v in values
        ]).arrange(RIGHT, buff=0.05, aligned_edge=DOWN).move_to(DOWN * 0.5)

        # Demo 3: Circle → morphs (right side)
        circle = Circle(radius=0.8, color=PRIMARY, fill_opacity=0.15, stroke_width=2)
        circle.shift(RIGHT * 3 + UP * 2)

        # Demo 4: Axes with function plot
        axes = Axes(
            x_range=[-2, 2, 1], y_range=[-1, 3, 1],
            x_length=4, y_length=2.5,
            axis_config={"color": SUBTLE, "stroke_width": 1}
        ).shift(LEFT * 3 + DOWN * 1.5)

        # Animate everything in parallel
        self.play(
            Write(eq1),
            LaggedStart(*[GrowFromEdge(b, DOWN) for b in bars], lag_ratio=0.05),
            Create(circle),
            Create(axes),
            run_time=1.5
        )
        self.wait(0.3)

        # Equation transform
        self.play(ReplacementTransform(eq1, eq2), run_time=0.8)

        # Sort bars (swap first two)
        self.play(
            bars[0].animate.set_color(HIGHLIGHT),
            bars[1].animate.set_color(HIGHLIGHT),
            run_time=0.3
        )
        self.play(
            bars[0].animate.shift(RIGHT * 0.35),
            bars[1].animate.shift(LEFT * 0.35),
            run_time=0.4
        )
        self.play(
            bars[0].animate.set_color(PRIMARY),
            bars[1].animate.set_color(PRIMARY),
            run_time=0.2
        )

        # Morph circle
        square = Square(side_length=1.4, color=ACCENT, fill_opacity=0.15, stroke_width=2).move_to(circle)
        self.play(Transform(circle, square), run_time=0.8)

        # Plot a curve on the axes
        graph = axes.plot(lambda x: x ** 2, x_range=[-1.8, 1.8], color=SECONDARY)
        self.play(Create(graph), run_time=1.0)

        # Morph to hexagon
        hex_s = RegularPolygon(n=6, color=SECONDARY, fill_opacity=0.15, stroke_width=2).scale(0.9).move_to(circle)
        self.play(Transform(circle, hex_s), run_time=0.7)

        self.wait(0.6)
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.5)


class Scene4_Workflow(Scene):
    """Animated workflow: prompt appears, code writes, video renders. 5.46s"""
    def construct(self):
        self.camera.background_color = BG

        # Step 1: Prompt appears
        prompt = Text('> "Animate gradient descent"', font_size=20, color=DIM, font=MONO)
        prompt.shift(UP * 2.5)
        self.play(FadeIn(prompt, shift=RIGHT * 0.3), run_time=0.5)

        # Step 2: Code block writes itself
        code_lines = [
            "class GradientDescent(Scene):",
            "    def construct(self):",
            "        axes = Axes(...)",
            "        curve = axes.plot(loss_fn)",
            "        dot = Dot(start_point)",
            "        self.play(Create(axes))",
            "        self.play(MoveAlongPath(dot...))",
        ]

        code_group = Group()
        for i, line in enumerate(code_lines):
            t = Text(line, font_size=12, color=PRIMARY if i == 0 else DIM, font=MONO)
            code_group.add(t)
        code_group.arrange(DOWN, buff=0.08, aligned_edge=LEFT)
        code_group.next_to(prompt, DOWN, buff=0.5).shift(LEFT * 1.0)

        self.play(LaggedStart(
            *[FadeIn(line, shift=RIGHT * 0.1) for line in code_group],
            lag_ratio=0.1, run_time=1.5
        ))

        self.wait(0.3)

        # Step 3: Arrow to output
        arrow = Arrow(ORIGIN, DOWN * 1.2, color=PRIMARY, stroke_width=2).next_to(code_group, DOWN, buff=0.3)
        self.play(GrowArrow(arrow), run_time=0.3)

        # Step 4: Video output icon
        output = RoundedRectangle(corner_radius=0.1, width=2.5, height=1.4,
                                   color=PRIMARY, fill_opacity=0.08, stroke_width=1.5)
        output.next_to(arrow, DOWN, buff=0.3)
        play_btn = RegularPolygon(n=3, color=WHITE, fill_opacity=0.5).scale(0.2).rotate(-PI / 6).move_to(output)

        self.play(FadeIn(output), GrowFromCenter(play_btn), run_time=0.5)

        # Pulse the output
        self.play(output.animate.set_stroke(width=3, color=ACCENT), run_time=0.3)
        self.play(output.animate.set_stroke(width=1.5, color=PRIMARY), run_time=0.3)

        self.wait(1.3)
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.4)


class Scene5_ManimPowered(Scene):
    """Showcase of Manim's signature animations. 5.56s"""
    def construct(self):
        self.camera.background_color = BG

        # Start with a circle
        c = Circle(radius=1.5, color=PRIMARY, stroke_width=3, fill_opacity=0.1)
        self.play(Create(c), run_time=0.8)

        # Inscribe a square
        sq = Square(side_length=2.12, color=ACCENT, stroke_width=2, fill_opacity=0.05)
        sq.move_to(c)
        self.play(Create(sq), run_time=0.6)

        # Draw diagonals
        d1 = Line(sq.get_corner(UL), sq.get_corner(DR), color=SECONDARY, stroke_width=1.5)
        d2 = Line(sq.get_corner(UR), sq.get_corner(DL), color=SECONDARY, stroke_width=1.5)
        self.play(Create(d1), Create(d2), run_time=0.5)

        # Inscribe another circle
        inner = Circle(radius=1.06, color=HIGHLIGHT, stroke_width=2, fill_opacity=0.05)
        inner.move_to(c)
        self.play(Create(inner), run_time=0.5)

        self.wait(0.3)

        # Rotate everything
        everything = Group(c, sq, d1, d2, inner)
        self.play(Rotate(everything, angle=PI / 4), run_time=1.0)

        # Morph to a hexagon
        hex_shape = RegularPolygon(n=6, color=PRIMARY, stroke_width=3, fill_opacity=0.1).scale(1.5)
        self.play(
            Transform(c, hex_shape),
            FadeOut(sq), FadeOut(d1), FadeOut(d2), FadeOut(inner),
            run_time=0.8
        )

        # Add "Manim CE" text
        label = Text("Manim Community Edition", font_size=20, color=DIM, font=FONT)
        label.next_to(c, DOWN, buff=0.5)
        self.play(FadeIn(label, shift=UP * 0.1), run_time=0.4)

        self.wait(0.5)
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.4)


class Scene6_References(Scene):
    """9 reference cards appear in staggered grid. 6.30s"""
    def construct(self):
        self.camera.background_color = BG

        refs = ["animations", "mobjects", "visual\ndesign",
                "equations", "graphs\n& data", "camera\n& 3D",
                "scene\nplanning", "rendering", "trouble\nshooting"]
        colors = [PRIMARY, ACCENT, SECONDARY, HIGHLIGHT, "#9B59B6",
                  "#E67E22", PRIMARY, ACCENT, SECONDARY]

        cards = Group()
        for name, color in zip(refs, colors):
            card = RoundedRectangle(corner_radius=0.08, width=1.8, height=0.9,
                                     color=color, fill_opacity=0.06, stroke_width=1.2)
            label = Text(name, font_size=11, color=color, font=MONO, line_spacing=0.3).move_to(card)
            cards.add(Group(card, label))

        cards.arrange_in_grid(rows=3, cols=3, buff=0.15).move_to(ORIGIN)

        self.play(
            LaggedStart(*[FadeIn(card, shift=UP * 0.3, scale=0.8) for card in cards],
                        lag_ratio=0.08, run_time=2.0)
        )

        self.wait(1.0)

        for card in cards:
            self.play(card[0].animate.set_fill(opacity=0.25), run_time=0.1)
            self.play(card[0].animate.set_fill(opacity=0.06), run_time=0.1)

        self.wait(1.0)
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.4)


class Scene7_UserExperience(Scene):
    """Prompt transforms into visual output. 6.09s"""
    def construct(self):
        self.camera.background_color = BG

        # Simple prompt
        caret = Text(">", font_size=24, color=PRIMARY, font=MONO).shift(LEFT * 3.5 + UP * 1.0)
        self.play(FadeIn(caret), run_time=0.2)

        prompt = Text("Explain gradient descent", font_size=20, color=WHITE, font=MONO)
        prompt.next_to(caret, RIGHT, buff=0.2)

        # Typewriter
        for i in range(0, len("Explain gradient descent"), 3):
            chunk = "Explain gradient descent"[:i + 3]
            new = Text(chunk, font_size=20, color=WHITE, font=MONO)
            new.next_to(caret, RIGHT, buff=0.2)
            self.remove(prompt)
            prompt = new
            self.add(prompt)
            self.wait(0.03)

        self.wait(0.5)

        # Transform prompt into actual visual output
        # Build a mini axes + curve + moving dot
        axes = Axes(
            x_range=[-1, 5, 1], y_range=[0, 5, 1],
            x_length=5, y_length=3.5,
            axis_config={"color": SUBTLE, "stroke_width": 1.5}
        ).shift(DOWN * 0.8)

        curve = axes.plot(lambda x: 0.3 * (x - 2.5) ** 2 + 0.5, x_range=[-0.5, 4.5], color=PRIMARY)

        self.play(
            FadeOut(caret), FadeOut(prompt),
            Create(axes), Create(curve),
            run_time=1.0
        )

        # Animated gradient descent dot
        dot = Dot(color=HIGHLIGHT, radius=0.1)
        dot.move_to(axes.c2p(4.0, 0.3 * (4.0 - 2.5) ** 2 + 0.5))
        self.play(FadeIn(dot), run_time=0.3)

        # Animate dot rolling down the curve
        positions = [3.5, 3.0, 2.8, 2.6, 2.55, 2.52, 2.5]
        for x in positions:
            y = 0.3 * (x - 2.5) ** 2 + 0.5
            self.play(dot.animate.move_to(axes.c2p(x, y)), run_time=0.25, rate_func=smooth)

        # Flash at minimum
        self.play(Flash(dot.get_center(), color=ACCENT, flash_radius=0.4), run_time=0.4)

        min_label = Text("minimum", font_size=14, color=ACCENT, font=FONT)
        min_label.next_to(dot, DOWN, buff=0.25)
        self.play(FadeIn(min_label, shift=UP * 0.1), run_time=0.3)

        self.wait(1.0)
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.4)


class Scene8_Closing(Scene):
    """Minimal end card. 3.66s"""
    def construct(self):
        self.camera.background_color = BG

        # Animated hexagon backdrop (callback to scene 5)
        hex_bg = RegularPolygon(n=6, color=PRIMARY, stroke_width=1, stroke_opacity=0.08, fill_opacity=0.02)
        hex_bg.scale(3)
        self.add(hex_bg)

        title = Text("manim-video", font_size=48, color=PRIMARY, weight=BOLD, font=MONO)
        sub = Text("Hermes Agent", font_size=20, color=DIM, font=FONT)
        sub.next_to(title, DOWN, buff=0.4)
        group = Group(title, sub).move_to(ORIGIN)

        self.play(Write(title), run_time=0.8)
        self.play(FadeIn(sub, shift=UP * 0.1), run_time=0.4)

        # Slow rotate the background hex
        self.play(Rotate(hex_bg, angle=PI / 6), run_time=2.0)

        self.play(FadeOut(Group(*self.mobjects)), run_time=0.5)
