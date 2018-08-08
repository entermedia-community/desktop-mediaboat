package org.entermediadb.mediaboat;

import java.awt.Dimension;
import java.awt.Toolkit;

import javax.swing.JFrame;

import org.entermediadb.mediaboat.components.LoginForm;

public class MainLaunch
{
	public MainLaunch()
	{
		// TODO Auto-generated constructor stub
	}
	
	  private static void createAndShowGUI() {
	        //Make sure we have nice window decorations.
	        JFrame.setDefaultLookAndFeelDecorated(false);

	        //Create and set up the window.
	        
	        //Display the window.
	        LoginForm frame = new LoginForm();
	        
	        AppController controller = new AppController();
	        frame.setAppController(controller);
	        frame.initContentPanel();
	        frame.setSize(600, 300);
	        Dimension screenSize = Toolkit.getDefaultToolkit().getScreenSize();
	        int centerX = screenSize.width/2 - frame.getWidth();
	        int centerY = screenSize.height/2 - frame.getHeight();
	        frame.setLocation(centerX, centerY);
	    }

	    public static void main(String[] args) {
	        //Schedule a job for the event-dispatching thread:
	        //creating and showing this application's GUI.
	        javax.swing.SwingUtilities.invokeLater(new Runnable() {
	            public void run() {
	                createAndShowGUI();
	            }
	        });
	    }
}
